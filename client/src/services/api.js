const API_BASE = '/api';

export async function fetchElections(status = 'all', search = '') {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.append('status', status);
  if (search) params.append('search', search);

  const res = await fetch(`${API_BASE}/elections?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch elections');
  return res.json();
}

export async function fetchElectionById(id) {
  const res = await fetch(`${API_BASE}/elections/${id}`);
  if (!res.ok) throw new Error('Failed to fetch election details');
  return res.json();
}

export async function createElection(payload) {
  const res = await fetch(`${API_BASE}/elections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create election');
  return data;
}

export async function startElectionLive(id) {
  const res = await fetch(`${API_BASE}/elections/${id}/live`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to start live polling');
  return data;
}

export async function publishElection(id) {
  const res = await fetch(`${API_BASE}/elections/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to publish election results');
  return data;
}

export async function deleteElection(id) {
  const res = await fetch(`${API_BASE}/elections/${id}`, {
    method: 'DELETE'
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete election');
  return data;
}

export async function castVote(slot) {
  const res = await fetch(`${API_BASE}/voting/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot })
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to cast ballot');
  return data;
}

export async function fetchHardwareStatus() {
  const res = await fetch(`${API_BASE}/hardware/status`);
  if (!res.ok) throw new Error('Failed to check hardware status');
  return res.json();
}

export async function triggerHardwareAction(action, count) {
  const res = await fetch(`${API_BASE}/hardware/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, count })
  });
  return res.json();
}

// WebSocket Live Telemetry
export function connectWebSocket(onMessage, onStatusChange) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  let socket = null;
  let retryTimer = null;

  function init() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      if (onStatusChange) onStatusChange(true);
      console.log('[WS] Connected to Election Telemetry Stream.');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessage) onMessage(data);
      } catch (err) {
        console.error('[WS PARSE ERROR]', err);
      }
    };

    socket.onclose = () => {
      if (onStatusChange) onStatusChange(false);
      console.log('[WS] Disconnected. Reconnecting in 3s...');
      retryTimer = setTimeout(init, 3000);
    };

    socket.onerror = (err) => {
      console.error('[WS ERROR]', err);
      socket.close();
    };
  }

  init();

  return () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (socket) socket.close();
  };
}
