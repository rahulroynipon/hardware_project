import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL connection pool
export const pool = new Pool({
  user: process.env.PGUSER || process.env.USER,
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'digital_election_db',
  password: process.env.PGPASSWORD || '',
  port: parseInt(process.env.PGPORT || '5432', 10),
});

// Database initialization & schema migration
export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Elections Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS elections (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        banner_image TEXT,
        organization VARCHAR(128),
        type VARCHAR(32) DEFAULT 'Scheduled',
        start_date VARCHAR(64),
        start_time VARCHAR(32),
        end_date VARCHAR(64),
        end_time VARCHAR(32),
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        total_voters INTEGER DEFAULT 1600,
        time_remaining VARCHAR(64),
        winner VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE elections ADD COLUMN IF NOT EXISTS banner_image TEXT;`);

    // 2. Candidates Table (Min 2, Max 4 mapped to slots A, B, C, D)
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id VARCHAR(64) PRIMARY KEY,
        election_id VARCHAR(64) NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
        name VARCHAR(128) NOT NULL,
        slot CHAR(1) NOT NULL,
        ballot_order INTEGER NOT NULL,
        votes INTEGER NOT NULL DEFAULT 0,
        bio TEXT,
        photo TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 3. Vote Audit Log Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS votes_log (
        id SERIAL PRIMARY KEY,
        election_id VARCHAR(64) NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
        candidate_id VARCHAR(64) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        slot CHAR(1) NOT NULL,
        source VARCHAR(32) DEFAULT 'hardware',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Seed default elections from electionData.json if table is empty
    const { rows } = await client.query('SELECT COUNT(*) as count FROM elections;');
    if (parseInt(rows[0].count, 10) === 0) {
      console.log('[DB] Seeding initial elections into PostgreSQL...');
      const seedPath = path.join(__dirname, 'data', 'electionData.json');
      if (fs.existsSync(seedPath)) {
        const raw = fs.readFileSync(seedPath, 'utf8');
        const seedData = JSON.parse(raw);

        for (const el of seedData.elections || []) {
          await client.query(`
            INSERT INTO elections (id, title, description, organization, type, start_date, start_time, end_date, end_time, status, total_voters, time_remaining, winner)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
          `, [
            el.id,
            el.title,
            el.description || '',
            el.organization || '',
            el.type || 'Scheduled',
            el.startDate || '',
            el.startTime || '',
            el.endDate || '',
            el.endTime || '',
            el.status || 'draft',
            el.totalVoters || 1600,
            el.timeRemaining || '',
            el.winner || null
          ]);

          for (const cand of el.candidates || []) {
            await client.query(`
              INSERT INTO candidates (id, election_id, name, slot, ballot_order, votes, bio, photo)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
            `, [
              cand.id,
              el.id,
              cand.name,
              cand.slot || 'A',
              cand.order || 1,
              cand.votes || 0,
              cand.bio || '',
              cand.photo || ''
            ]);
          }
        }
        console.log('[DB] Seeded', seedData.elections.length, 'elections successfully.');
      }
    }

    await client.query('COMMIT');
    console.log('[DB] PostgreSQL schema verified & connected successfully to digital_election_db.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB ERROR] Error initializing PostgreSQL:', err);
    throw err;
  } finally {
    client.release();
  }
}
