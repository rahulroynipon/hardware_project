import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { pool, initDb } from './db.js';
import { arduinoBridge } from './arduinoSerial.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ---------- WebSocket Broadcasting ----------
function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload, timestamp: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[WS] Client connected to live telemetry stream.');
  ws.send(JSON.stringify({ type: 'CONNECTED', payload: { message: 'Connected to Election System WebSocket' } }));
});

// ---------- Helper: Get Current Live Election ----------
async function getLiveElection() {
  const { rows } = await pool.query("SELECT * FROM elections WHERE status = 'live' LIMIT 1;");
  if (rows.length === 0) return null;

  const election = rows[0];
  const candRes = await pool.query('SELECT * FROM candidates WHERE election_id = $1 ORDER BY ballot_order ASC;', [election.id]);
  election.candidates = candRes.rows;
  return election;
}

// ---------- Helper: Auto-Create 4-Candidate Live Election ----------
async function createAutoLiveElection() {
  const existingLive = await getLiveElection();
  if (existingLive) return existingLive;

  const id = `auto-${Date.now()}`;
  const title = `Auto Election #${Math.floor(100 + Math.random() * 900)}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO elections (id, title, description, organization, type, start_date, start_time, end_date, end_time, status, total_voters, time_remaining)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'live', 1600, '5h 00m');
    `, [
      id,
      title,
      'Automatically generated live election session from Arduino voting machine.',
      'General Council',
      'Instant',
      new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      '10:00 AM',
      new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      '05:00 PM'
    ]);

    const candidates = [
      { name: 'Candidate A', slot: 'A', order: 1, bio: 'Student Representative - Slot A' },
      { name: 'Candidate B', slot: 'B', order: 2, bio: 'Student Representative - Slot B' },
      { name: 'Candidate C', slot: 'C', order: 3, bio: 'Student Representative - Slot C' },
      { name: 'Candidate D', slot: 'D', order: 4, bio: 'Student Representative - Slot D' },
    ];

    for (const c of candidates) {
      await client.query(`
        INSERT INTO candidates (id, election_id, name, slot, ballot_order, votes, bio, photo)
        VALUES ($1, $2, $3, $4, $5, 0, $6, $7);
      `, [
        `cand-${id}-${c.slot}`,
        id,
        c.name,
        c.slot,
        c.order,
        c.bio,
        `https://images.unsplash.com/photo-${c.slot === 'A' ? '1534528741775-53994a69daeb' : c.slot === 'B' ? '1507003211169-0a1dd7228f2d' : c.slot === 'C' ? '1517841905240-472988babdf9' : '1500648767791-00dcc994a43e'}?auto=format&fit=crop&w=400&q=80`
      ]);
    }

    await client.query('COMMIT');

    console.log(`[AUTO-ELECTION] Created instant live election: ${title} (${id}) with 4 candidates.`);
    arduinoBridge.setCandidateCount(4);

    const created = await getLiveElection();
    broadcast('ELECTION_CREATED', created);
    broadcast('ELECTION_UPDATED', created);
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[AUTO-ELECTION ERROR]', err);
    throw err;
  } finally {
    client.release();
  }
}

// ---------- Helper: Cast Vote by Slot (A, B, C, D) ----------
async function castVoteBySlot(slot) {
  let liveElection = await getLiveElection();
  if (!liveElection) {
    console.log(`[VOTE] No live election. Auto-creating live election for vote slot ${slot}...`);
    liveElection = await createAutoLiveElection();
  }

  const candidate = liveElection.candidates.find(c => c.slot.toUpperCase() === slot.toUpperCase());
  if (!candidate) {
    console.log(`[VOTE BLOCKED] Slot ${slot} disabled in current election (${liveElection.candidates.length} active).`);
    broadcast('VOTE_BLOCKED', { slot, message: 'Slot not active in this election' });
    return null;
  }

  // Update candidate votes in DB
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('UPDATE candidates SET votes = votes + 1 WHERE id = $1;', [candidate.id]);
    await client.query(`
      INSERT INTO votes_log (election_id, candidate_id, slot, source)
      VALUES ($1, $2, $3, 'hardware');
    `, [liveElection.id, candidate.id, slot.toUpperCase()]);

    await client.query('COMMIT');

    candidate.votes += 1;
    const totalVotes = liveElection.candidates.reduce((sum, c) => sum + (c.votes || 0), 0);

    console.log(`[VOTE CAST] ${candidate.name} (Slot ${slot}) -> Total: ${candidate.votes} votes. Aggregate: ${totalVotes}`);

    broadcast('VOTE_CAST', {
      electionId: liveElection.id,
      candidateId: candidate.id,
      slot: slot.toUpperCase(),
      candidateName: candidate.name,
      candidateVotes: candidate.votes,
      totalVotes,
      candidates: liveElection.candidates
    });

    return { candidate, totalVotes };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[VOTE CAST ERROR]', err);
    throw err;
  } finally {
    client.release();
  }
}

// ---------- Wire Up Arduino Hardware Events ----------
arduinoBridge.setCallbacks({
  onVote: (slot) => {
    castVoteBySlot(slot).catch(console.error);
  },
  onStart: () => {
    console.log('[HARDWARE EVENT] Pin 7 Start Voting pressed on Arduino.');
    getLiveElection().then((live) => {
      if (!live) {
        createAutoLiveElection().catch(console.error);
      }
    });
    broadcast('HARDWARE_EVENT', { action: 'START', message: 'Physical voting started on Arduino' });
  },
  onPublish: async () => {
    console.log('[HARDWARE EVENT] Pin 7 Publish pressed on Arduino.');
    const live = await getLiveElection();
    if (live) {
      // Find winner
      let highest = -1;
      let winnerName = 'Tie / No Votes';
      let tie = false;

      live.candidates.forEach(c => {
        if (c.votes > highest) {
          highest = c.votes;
          winnerName = c.name;
          tie = false;
        } else if (c.votes === highest && highest > 0) {
          tie = true;
        }
      });

      if (tie) winnerName = 'Tie - Multiple Winners';
      if (highest <= 0) winnerName = 'No Votes Cast';

      await pool.query("UPDATE elections SET status = 'published', winner = $1, updated_at = NOW() WHERE id = $2;", [winnerName, live.id]);
      live.status = 'published';
      live.winner = winnerName;

      broadcast('ELECTION_UPDATED', live);
      broadcast('HARDWARE_EVENT', { action: 'PUBLISH', election: live, winner: winnerName });
    }
  },
  onReset: async () => {
    console.log('[HARDWARE EVENT] Pin 7 Reset (3s) triggered on Arduino.');
    broadcast('HARDWARE_EVENT', { action: 'RESET', message: 'Hardware tallies reset' });
  },
  onConnect: async () => {
    try {
      const live = await getLiveElection();
      if (live && live.candidates && live.candidates.length > 0) {
        console.log(`[SERIAL SYNC] Auto-syncing Arduino candidate count to ${live.candidates.length} for live election "${live.title}".`);
        arduinoBridge.setCandidateCount(live.candidates.length);
        arduinoBridge.startVoting();
      }
    } catch (err) {
      console.error('[SERIAL SYNC ERROR]', err);
    }
  }
});

// ---------- REST API Endpoints ----------

// 1. Get all elections (with candidate details & KPI counts)
app.get('/api/elections', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT * FROM elections';
    const params = [];

    if (status && status !== 'all') {
      params.push(status.toLowerCase());
      query += ` WHERE status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += (params.length === 1 ? ' WHERE' : ' AND') + ` (title ILIKE $${params.length} OR organization ILIKE $${params.length})`;
    }

    query += ' ORDER BY created_at DESC;';

    const { rows: elections } = await pool.query(query, params);

    // Attach candidates to each election
    for (const el of elections) {
      const candRes = await pool.query('SELECT * FROM candidates WHERE election_id = $1 ORDER BY ballot_order ASC;', [el.id]);
      el.candidates = candRes.rows;
      el.totalVotes = el.candidates.reduce((sum, c) => sum + (c.votes || 0), 0);
    }

    // Compute KPI counts across all elections
    const kpiRes = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'draft') as draft,
        COUNT(*) FILTER (WHERE status = 'live') as live,
        COUNT(*) FILTER (WHERE status = 'published') as published
      FROM elections;
    `);

    res.json({
      success: true,
      elections,
      counts: {
        total: parseInt(kpiRes.rows[0].total, 10),
        draft: parseInt(kpiRes.rows[0].draft, 10),
        live: parseInt(kpiRes.rows[0].live, 10),
        published: parseInt(kpiRes.rows[0].published, 10)
      }
    });
  } catch (err) {
    console.error('[GET /api/elections ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get single election by ID
app.get('/api/elections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM elections WHERE id = $1;', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Election not found' });
    }

    const election = rows[0];
    const candRes = await pool.query('SELECT * FROM candidates WHERE election_id = $1 ORDER BY ballot_order ASC;', [id]);
    election.candidates = candRes.rows;
    election.totalVotes = election.candidates.reduce((sum, c) => sum + (c.votes || 0), 0);

    // Fetch recent ballot stream
    const logRes = await pool.query(`
      SELECT vl.id, vl.slot, vl.timestamp, c.name as candidate_name
      FROM votes_log vl
      JOIN candidates c ON vl.candidate_id = c.id
      WHERE vl.election_id = $1
      ORDER BY vl.timestamp DESC
      LIMIT 10;
    `, [id]);
    election.recentVotes = logRes.rows;

    res.json({ success: true, election });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Create election (Min 2, Max 4 candidates, initial state draft/live)
app.post('/api/elections', async (req, res) => {
  const {
    title,
    description,
    banner_image,
    image,
    organization,
    type,
    startDate,
    startTime,
    endDate,
    endTime,
    candidates = []
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Election title is required' });
  }

  if (candidates.length < 2 || candidates.length > 4) {
    return res.status(400).json({ success: false, error: 'An election must have between 2 and 4 candidates' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const electionType = type || 'Instant';
    const bannerImg = banner_image || image || null;
    const timeRemaining = req.body.time_remaining || req.body.timeRemaining || '5h 00m';

    // Mark previous live election as published so this new election goes live immediately
    await client.query("UPDATE elections SET status = 'published' WHERE status = 'live';");
    const initialStatus = 'live';

    const id = `elec-${Date.now()}`;
    await client.query(`
      INSERT INTO elections (id, title, description, banner_image, organization, type, start_date, start_time, end_date, end_time, status, total_voters, time_remaining)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
    `, [
      id,
      title,
      description || '',
      bannerImg,
      organization || 'Campus Election',
      electionType,
      req.body.start_date || startDate || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      startTime || '10:00 AM',
      req.body.end_date || endDate || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      endTime || '05:00 PM',
      initialStatus,
      1600,
      timeRemaining
    ]);

    const slots = ['A', 'B', 'C', 'D'];
    const insertedCandidates = [];

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const slot = slots[i];
      const candId = `cand-${id}-${slot}`;
      const ballotOrder = c.order || (i + 1);

      await client.query(`
        INSERT INTO candidates (id, election_id, name, slot, ballot_order, votes, bio, photo)
        VALUES ($1, $2, $3, $4, $5, 0, $6, $7);
      `, [
        candId,
        id,
        c.name || `Candidate ${slot}`,
        slot,
        ballotOrder,
        c.bio || '',
        c.photo || `https://images.unsplash.com/photo-${i === 0 ? '1534528741775-53994a69daeb' : i === 1 ? '1507003211169-0a1dd7228f2d' : i === 2 ? '1517841905240-472988babdf9' : '1500648767791-00dcc994a43e'}?auto=format&fit=crop&w=400&q=80`
      ]);

      insertedCandidates.push({ id: candId, name: c.name, slot, order: ballotOrder, votes: 0, bio: c.bio, photo: c.photo });
    }

    await client.query('COMMIT');

    // If made live, sync Arduino candidate count
    if (initialStatus === 'live') {
      arduinoBridge.setCandidateCount(candidates.length);
      arduinoBridge.startVoting();
    }

    const newElection = {
      id,
      title,
      description,
      banner_image: bannerImg,
      organization: organization || 'Campus Election',
      type: electionType,
      startDate: startDate || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      startTime: startTime || '10:00 AM',
      endDate: endDate || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      endTime: endTime || '05:00 PM',
      status: initialStatus,
      totalVoters: 1600,
      candidates: insertedCandidates,
      totalVotes: 0
    };

    broadcast('ELECTION_CREATED', newElection);
    res.status(201).json({ success: true, election: newElection });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /api/elections ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// 4. Set election to LIVE (Strict single-live enforcement)
app.post('/api/elections/:id/live', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM elections WHERE id = $1;', [id]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Election not found' });
    }

    const election = rows[0];

    // Rule: Published elections can NEVER go back to live
    if (election.status === 'published') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'This election is published and permanently sealed. It cannot be reopened.' });
    }

    // Rule: Only 1 election can be live at a time
    const liveCheck = await client.query("SELECT id, title FROM elections WHERE status = 'live' AND id != $1;", [id]);
    if (liveCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Cannot start live polling: "${liveCheck.rows[0].title}" is already live. Only one election can be live at a time. Please end or publish the active election first.`
      });
    }

    await client.query("UPDATE elections SET status = 'live', updated_at = NOW() WHERE id = $1;", [id]);

    const candRes = await client.query('SELECT * FROM candidates WHERE election_id = $1 ORDER BY ballot_order ASC;', [id]);
    election.candidates = candRes.rows;
    election.status = 'live';

    await client.query('COMMIT');

    // Sync physical Arduino
    arduinoBridge.setCandidateCount(candRes.rows.length);
    arduinoBridge.startVoting();

    broadcast('ELECTION_UPDATED', election);
    res.json({ success: true, election });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// 5. End & Publish Election (Permanent lock)
app.post('/api/elections/:id/publish', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM elections WHERE id = $1;', [id]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Election not found' });
    }

    const election = rows[0];
    const candRes = await client.query('SELECT * FROM candidates WHERE election_id = $1 ORDER BY ballot_order ASC;', [id]);
    const candidates = candRes.rows;

    let highest = -1;
    let winner = 'No Votes Cast';
    let tie = false;

    candidates.forEach(c => {
      if (c.votes > highest) {
        highest = c.votes;
        winner = c.name;
        tie = false;
      } else if (c.votes === highest && highest > 0) {
        tie = true;
      }
    });

    if (tie) winner = 'Tie - Multiple Winners';
    if (highest <= 0) winner = 'No Votes Cast';

    await client.query("UPDATE elections SET status = 'published', winner = $1, updated_at = NOW() WHERE id = $2;", [winner, id]);

    election.status = 'published';
    election.winner = winner;
    election.candidates = candidates;

    await client.query('COMMIT');

    // Notify physical Arduino to close voting and illuminate Red LED
    arduinoBridge.publishResults();

    broadcast('ELECTION_UPDATED', election);
    res.json({ success: true, election });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// 6. Delete election
app.delete('/api/elections/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM elections WHERE id = $1;', [id]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Election not found' });
    }
    const election = rows[0];
    await client.query('DELETE FROM elections WHERE id = $1;', [id]);
    await client.query('COMMIT');

    if (election.status === 'live') {
      arduinoBridge.publishResults();
    }
    broadcast('ELECTION_DELETED', { id });
    res.json({ success: true, message: 'Election deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// 6. Cast Vote manually / from UI
app.post('/api/voting/vote', async (req, res) => {
  const { slot } = req.body;
  if (!slot || !['A', 'B', 'C', 'D'].includes(slot.toUpperCase())) {
    return res.status(400).json({ success: false, error: 'Invalid candidate slot. Must be A, B, C, or D.' });
  }

  try {
    const result = await castVoteBySlot(slot.toUpperCase());
    if (!result) {
      return res.status(400).json({ success: false, error: `Candidate slot ${slot} is disabled in the active election.` });
    }
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Hardware actions trigger
app.post('/api/hardware/action', (req, res) => {
  const { action, count } = req.body;
  switch (action) {
    case 'START':
      arduinoBridge.startVoting();
      break;
    case 'PUBLISH':
      arduinoBridge.publishResults();
      break;
    case 'RESET':
      arduinoBridge.resetMachine();
      break;
    case 'POWER_OFF':
      arduinoBridge.powerOff();
      break;
    case 'POWER_ON':
      arduinoBridge.powerOn();
      break;
    case 'SET_COUNT':
      if (count >= 2 && count <= 4) arduinoBridge.setCandidateCount(count);
      break;
    default:
      return res.status(400).json({ success: false, error: 'Unknown hardware action' });
  }
  res.json({ success: true, action });
});

// 8. Hardware connection status
app.get('/api/hardware/status', async (req, res) => {
  const live = await getLiveElection();
  res.json({
    connected: arduinoBridge.isConnected,
    port: arduinoBridge.portPath,
    liveElection: live ? { id: live.id, title: live.title, candidateCount: live.candidates.length } : null
  });
});

// Start Server & Connect to PostgreSQL + Serial
const PORT = process.env.PORT || 5050;

async function bootstrap() {
  try {
    await initDb();
    server.listen(PORT, () => {
      console.log(`[SERVER] Express API & WebSocket Server running at http://localhost:${PORT}`);
    });
    arduinoBridge.connect();
  } catch (err) {
    console.error('[BOOTSTRAP ERROR] Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
