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
    arduinoBridge.startVoting();
    setTimeout(() => arduinoBridge.syncTallies([0, 0, 0, 0]), 200);

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
async function castVoteBySlot(slot, { fromHardware = false } = {}) {
  let liveElection = await getLiveElection();
  if (!liveElection) {
    const { rows } = await pool.query("SELECT * FROM elections ORDER BY updated_at DESC, created_at DESC LIMIT 1;");
    if (rows.length > 0 && rows[0].status === 'published') {
      const pub = rows[0];
      if (!fromHardware) {
        arduinoBridge.simulateVote(slot.toUpperCase());
      }
      console.log(`[VOTE BLOCKED] Voting is closed. "${pub.title}" is already published (Winner: ${pub.winner}).`);
      return {
        isPublished: true,
        winner: pub.winner,
        electionTitle: pub.title,
        error: `Voting is closed. "${pub.title}" is permanently published. Winner: ${pub.winner}`
      };
    }
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
      VALUES ($1, $2, $3, $4);
    `, [liveElection.id, candidate.id, slot.toUpperCase(), fromHardware ? 'hardware' : 'web']);

    await client.query('COMMIT');

    candidate.votes += 1;
    const totalVotes = liveElection.candidates.reduce((sum, c) => sum + (c.votes || 0), 0);

    console.log(`[VOTE CAST] ${candidate.name} (Slot ${slot}) -> Total: ${candidate.votes} votes. Aggregate: ${totalVotes}`);

    // If vote was initiated from Web UI, tell physical Arduino Uno to record vote & update LCD display
    if (!fromHardware) {
      arduinoBridge.simulateVote(slot.toUpperCase());
    }

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

// ---------- Unified Helper: Close & Publish Live Election on Web & Arduino ----------
async function closeAndPublishLiveElection(electionId = null) {
  let election = null;
  if (electionId) {
    const { rows } = await pool.query('SELECT * FROM elections WHERE id = $1;', [electionId]);
    if (rows.length === 0) return null;
    election = rows[0];
  } else {
    election = await getLiveElection();
  }

  if (!election) return null;

  const candRes = await pool.query('SELECT * FROM candidates WHERE election_id = $1 ORDER BY ballot_order ASC;', [election.id]);
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

  await pool.query("UPDATE elections SET status = 'published', winner = $1, updated_at = NOW() WHERE id = $2;", [winner, election.id]);

  election.status = 'published';
  election.winner = winner;
  election.candidates = candidates;

  // Sync latest tallies to Arduino and then tell it to publish results and illuminate Red LED
  const tallies = [0, 0, 0, 0];
  candidates.forEach(c => {
    const idx = (c.slot || '').toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < 4) tallies[idx] = c.votes || 0;
  });
  arduinoBridge.syncTallies(tallies);
  setTimeout(() => {
    arduinoBridge.publishResults();
  }, 150);

  broadcast('ELECTION_UPDATED', election);
  broadcast('HARDWARE_EVENT', { action: 'PUBLISH', election, winner });

  console.log(`[ELECTION PUBLISHED] "${election.title}" sealed. Winner: ${winner}`);
  return election;
}

// ---------- Wire Up Arduino Hardware Events ----------
arduinoBridge.setCallbacks({
  onVote: (slot) => {
    castVoteBySlot(slot, { fromHardware: true }).catch(console.error);
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
    await closeAndPublishLiveElection();
  },
  onReset: async () => {
    console.log('[HARDWARE EVENT] Pin 7 Reset (3s) triggered on Arduino.');
    try {
      await pool.query("UPDATE elections SET status = 'completed' WHERE status = 'live';");
    } catch (e) {
      console.error('[RESET DB ERR]', e);
    }
    broadcast('HARDWARE_EVENT', { action: 'RESET', message: 'Machine reset to Standby' });
  },
  onInspect: (cand) => {
    let slot = String(cand || '').toUpperCase().trim();
    if (slot === 'W' || slot === '5') slot = 'WINNER';
    else if (slot === 'T' || slot === '0') slot = 'TOTAL';
    else if (slot === '1') slot = 'A';
    else if (slot === '2') slot = 'B';
    else if (slot === '3') slot = 'C';
    else if (slot === '4') slot = 'D';

    console.log(`[HARDWARE EVENT] LCD displayed slot ${slot} (raw: ${cand}) on Arduino.`);
    broadcast('HARDWARE_EVENT', {
      action: 'INSPECT',
      slot,
      rawSlot: cand,
      message: `${slot === 'WINNER' ? 'Winner' : slot === 'TOTAL' ? 'Total votes' : `Candidate ${slot}`} displayed on Arduino LCD`
    });
  },
  onVoteBlocked: (cand, reason) => {
    console.log(`[HARDWARE EVENT] Vote blocked on Arduino for Candidate ${cand} (reason: ${reason})`);
    const isNotStarted = (reason === 'VotingNotStarted');
    broadcast('HARDWARE_EVENT', {
      action: 'VOTE_BLOCKED',
      slot: cand,
      reason,
      message: isNotStarted ? 'NOT STARTED - Press to Start' : 'RESULT PUBLISHED - Voting is closed'
    });
  },
  onConnect: async () => {
    try {
      let targetElection = await getLiveElection();
      let isPublishedSync = false;

      if (!targetElection) {
        const { rows } = await pool.query(
          "SELECT * FROM elections WHERE status = 'published' ORDER BY updated_at DESC, created_at DESC LIMIT 1;"
        );
        if (rows.length > 0) {
          const pub = rows[0];
          const candRes = await pool.query(
            "SELECT * FROM candidates WHERE election_id = $1 ORDER BY ballot_order ASC;",
            [pub.id]
          );
          pub.candidates = candRes.rows;
          targetElection = pub;
          isPublishedSync = true;
        }
      }

      if (targetElection && targetElection.candidates && targetElection.candidates.length > 0) {
        console.log(`[SERIAL SYNC] Auto-syncing Arduino (${isPublishedSync ? 'PUBLISHED' : 'LIVE'}) "${targetElection.title}"...`);
        arduinoBridge.setCandidateCount(targetElection.candidates.length);

        const tallies = [0, 0, 0, 0];
        targetElection.candidates.forEach((c) => {
          const idx = (c.slot || '').toUpperCase().charCodeAt(0) - 65;
          if (idx >= 0 && idx < 4) {
            tallies[idx] = c.votes || 0;
          }
        });

        if (isPublishedSync) {
          arduinoBridge.syncTallies(tallies);
          setTimeout(() => {
            arduinoBridge.publishResults();
          }, 350);
        } else {
          arduinoBridge.startVoting();
          setTimeout(() => {
            arduinoBridge.syncTallies(tallies);
          }, 350);
        }
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

    const tallies = [0, 0, 0, 0];
    candRes.rows.forEach((c) => {
      const idx = (c.slot || '').toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < 4) tallies[idx] = c.votes || 0;
    });
    setTimeout(() => arduinoBridge.syncTallies(tallies), 300);

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
  try {
    const election = await closeAndPublishLiveElection(id);
    if (!election) {
      return res.status(404).json({ success: false, error: 'Election not found' });
    }
    res.json({ success: true, election });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
    const result = await castVoteBySlot(slot.toUpperCase(), { fromHardware: false });
    if (!result) {
      return res.status(400).json({ success: false, error: `Candidate slot ${slot} is disabled in the active election.` });
    }
    if (result.isPublished) {
      return res.status(400).json({ success: false, isPublished: true, winner: result.winner, error: result.error });
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
      closeAndPublishLiveElection().catch(console.error);
      break;
    case 'RESET':
      arduinoBridge.resetMachine();
      pool.query("UPDATE elections SET status = 'completed' WHERE status = 'live';").catch(console.error);
      broadcast('HARDWARE_EVENT', { action: 'RESET', message: 'Machine reset to Standby' });
      break;
    case 'POWER_OFF':
      arduinoBridge.powerOff();
      broadcast('HARDWARE_EVENT', { action: 'POWER_OFF', message: 'Display Sleep' });
      break;
    case 'POWER_ON':
      arduinoBridge.powerOn();
      broadcast('HARDWARE_EVENT', { action: 'POWER_ON', message: 'Display Wake' });
      break;
    case 'SET_COUNT':
      if (count >= 2 && count <= 4) arduinoBridge.setCandidateCount(count);
      break;
    case 'SYNC':
      getLiveElection().then((liveSync) => {
        if (liveSync && liveSync.candidates) {
          const tallies = [0, 0, 0, 0];
          liveSync.candidates.forEach((c) => {
            const idx = (c.slot || '').toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < 4) tallies[idx] = c.votes || 0;
          });
          arduinoBridge.setCandidateCount(liveSync.candidates.length);
          arduinoBridge.startVoting();
          setTimeout(() => arduinoBridge.syncTallies(tallies), 250);
        }
      }).catch(console.error);
      break;
    case 'SHOW_CANDIDATE': {
      const slot = (req.body.slot || 'A').toUpperCase();
      arduinoBridge.send(`SHOW_CANDIDATE:${slot}`);
      broadcast('HARDWARE_EVENT', { action: 'INSPECT', slot, message: `Candidate ${slot} displayed on Arduino LCD` });
      break;
    }
    case 'SHOW_WINNER': {
      arduinoBridge.send('SHOW_WINNER');
      broadcast('HARDWARE_EVENT', { action: 'INSPECT', slot: 'WINNER', message: 'Winner displayed on Arduino LCD' });
      break;
    }
    case 'SHOW_TOTAL': {
      arduinoBridge.send('SHOW_TOTAL');
      broadcast('HARDWARE_EVENT', { action: 'INSPECT', slot: 'TOTAL', message: 'Total votes displayed on Arduino LCD' });
      break;
    }
    case 'CYCLE_STATS': {
      arduinoBridge.send('CYCLE_STATS');
      broadcast('HARDWARE_EVENT', { action: 'CYCLE_STATS', message: 'Cycled Arduino LCD display page' });
      break;
    }
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

// 8.5 Sync live election candidates & votes to Arduino LCD
app.post('/api/hardware/sync', async (req, res) => {
  try {
    let election = await getLiveElection();
    let isPublishedSync = false;

    if (!election) {
      const { rows } = await pool.query(
        "SELECT * FROM elections WHERE status = 'published' ORDER BY updated_at DESC, created_at DESC LIMIT 1;"
      );
      if (rows.length > 0) {
        const pub = rows[0];
        const candRes = await pool.query(
          "SELECT * FROM candidates WHERE election_id = $1 ORDER BY ballot_order ASC;",
          [pub.id]
        );
        pub.candidates = candRes.rows;
        election = pub;
        isPublishedSync = true;
      }
    }

    if (!election || !election.candidates || election.candidates.length === 0) {
      arduinoBridge.syncState('STANDBY', [0, 0, 0, 0]);
      broadcast('HARDWARE_EVENT', { action: 'RESET', message: 'Machine synced to Standby mode' });
      return res.json({ success: true, message: 'Synchronized Arduino to Standby mode', state: 'STANDBY' });
    }

    const tallies = [0, 0, 0, 0];
    election.candidates.forEach((c) => {
      const idx = (c.slot || '').toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < 4) {
        tallies[idx] = c.votes || 0;
      }
    });

    arduinoBridge.setCandidateCount(election.candidates.length);
    const targetState = isPublishedSync ? 'PUBLISHED' : 'VOTING';
    arduinoBridge.syncState(targetState, tallies);
    broadcast('HARDWARE_EVENT', {
      action: isPublishedSync ? 'PUBLISH' : 'START',
      election,
      message: `Synchronized ${targetState} mode with Arduino`
    });

    console.log(`[HARDWARE SYNC] Synced (${isPublishedSync ? 'PUBLISHED' : 'LIVE'}) "${election.title}" (${election.candidates.length} candidates, tallies: ${tallies.join(',')}) to Arduino.`);
    res.json({
      success: true,
      message: `Synchronized "${election.title}" with Arduino display`,
      election: election.title,
      isPublished: isPublishedSync,
      candidateCount: election.candidates.length,
      tallies: {
        A: tallies[0],
        B: tallies[1],
        C: tallies[2],
        D: tallies[3]
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Hardware firmware upload / flash endpoint
app.post('/api/hardware/flash', async (req, res) => {
  const { exec } = await import('child_process');
  const path = await import('path');

  try {
    console.log('[HARDWARE FLASH] Closing serial port for firmware flashing...');
    await arduinoBridge.disconnect();
    await new Promise(r => setTimeout(r, 1200));

    const cliPath = '/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli';
    const sketchPath = path.resolve(process.cwd(), '../digital_voting_machine');
    const port = arduinoBridge.portPath;

    console.log(`[HARDWARE FLASH] Running arduino-cli compile --upload on ${port}...`);

    exec(`"${cliPath}" compile --upload -p "${port}" --fqbn arduino:avr:uno "${sketchPath}"`, async (err, stdout, stderr) => {
      // Re-establish connection after flash finishes
      setTimeout(() => {
        arduinoBridge.connect();
      }, 1500);

      if (err) {
        console.error('[HARDWARE FLASH ERROR]', stderr || stdout || err.message);
        return res.status(500).json({ success: false, error: stderr || stdout || err.message });
      }

      console.log('[HARDWARE FLASH SUCCESS]', stdout);
      return res.json({ success: true, message: 'Arduino firmware updated and flashed successfully!', output: stdout });
    });
  } catch (err) {
    arduinoBridge.connect();
    res.status(500).json({ success: false, error: err.message });
  }
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
