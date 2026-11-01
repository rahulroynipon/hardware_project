import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ElectionsList from './components/ElectionsList';
import ElectionDetails from './components/ElectionDetails';
import CreateElectionModal from './components/CreateElectionModal';
import HardwareModal from './components/HardwareModal';
import InstructionsGuide from './components/InstructionsGuide';
import {
  fetchElections,
  createElection,
  startElectionLive,
  publishElection,
  deleteElection,
  fetchHardwareStatus,
  fetchHardwareTestMode,
  connectWebSocket
} from './services/api';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'elections', 'details'
  const [selectedElectionId, setSelectedElectionId] = useState(null);
  const [elections, setElections] = useState([]);
  const [counts, setCounts] = useState({ total: 0, draft: 0, live: 0, published: 0 });
  const [loading, setLoading] = useState(true);
  const [isHardwareConnected, setIsHardwareConnected] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [hardwareNotice, setHardwareNotice] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [lastHardwareEvent, setLastHardwareEvent] = useState(null);
  const prevConnectedRef = useRef(null);

  // Load elections from Express & PostgreSQL
  const loadElections = useCallback(async () => {
    try {
      const data = await fetchElections();
      if (data.success) {
        setElections(data.elections || []);
        setCounts(data.counts || { total: 0, draft: 0, live: 0, published: 0 });
      }
    } catch (err) {
      console.error('[LOAD ELECTIONS ERROR]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update hardware status and trigger side alert notification on state transitions
  const updateHardwareStatus = useCallback((connected, portPath = '') => {
    setIsHardwareConnected((prev) => {
      // First initialization
      if (prevConnectedRef.current === null) {
        prevConnectedRef.current = connected;
        if (!connected) {
          setHardwareNotice({
            type: 'disconnected',
            title: 'Please Connect Hardware',
            message: 'Arduino Uno voting machine is not detected on USB. Physical push-button voting is unavailable.'
          });
        }
        return connected;
      }

      // Transition: Disconnected -> Reconnected
      if (!prev && connected) {
        prevConnectedRef.current = true;
        setHardwareNotice({
          type: 'connected',
          title: 'Hardware Connected',
          message: `Arduino Uno successfully detected${portPath ? ` on ${portPath}` : ''}. Physical voting & live sync are ready.`
        });
        setTimeout(() => {
          setHardwareNotice((curr) => (curr?.type === 'connected' ? null : curr));
        }, 5000);
      }
      // Transition: Connected -> Disconnected
      else if (prev && !connected) {
        prevConnectedRef.current = false;
        setHardwareNotice({
          type: 'disconnected',
          title: 'Hardware Disconnected',
          message: 'Arduino Uno voting machine has been unplugged. Please connect the hardware via USB to enable physical voting.'
        });
      }

      return connected;
    });
  }, []);

  // Check hardware connection via REST
  const checkHardware = useCallback(async () => {
    try {
      const data = await fetchHardwareStatus();
      updateHardwareStatus(data.connected, data.port);
    } catch (e) {
      updateHardwareStatus(false);
    }
  }, [updateHardwareStatus]);

  useEffect(() => {
    loadElections();
    checkHardware();
    fetchHardwareTestMode().then((d) => setIsTestMode(Boolean(d.testMode))).catch(() => {});

    // Polling interval for fast physical hot-plug detection
    const pollInterval = setInterval(checkHardware, 2500);

    // Setup live WebSocket telemetry
    const cleanupWs = connectWebSocket(
      (msg) => {
        if (msg.type === 'HARDWARE_STATUS') {
          updateHardwareStatus(msg.payload.connected, msg.payload.port);
        } else if (msg.type === 'TEST_MODE_CHANGED') {
          setIsTestMode(Boolean(msg.payload.testMode));
        } else if (msg.type === 'TEST_VOTE_CAST') {
          // Test vote: do NOT increment official DB tallies or modify election votes
          setLastHardwareEvent({
            action: 'TEST_VOTE',
            slot: msg.payload.slot,
            fromHardware: msg.payload.fromHardware,
            _t: Date.now()
          });
        } else if (msg.type === 'VOTE_CAST') {
          // Live vote update: increment candidate votes in official state
          const { electionId, candidateId, candidateVotes, slot } = msg.payload;
          setLastHardwareEvent({ action: 'VOTE_CAST', slot, _t: Date.now() });
          setElections((prev) =>
            prev.map((el) => {
              if (el.id === electionId) {
                const updatedCandidates = el.candidates.map((c) =>
                  c.id === candidateId ? { ...c, votes: candidateVotes } : c
                );
                return { ...el, candidates: updatedCandidates };
              }
              return el;
            })
          );
        } else if (msg.type === 'HARDWARE_EVENT') {
          setLastHardwareEvent({ ...msg.payload, _t: Date.now() });
          if (msg.payload.action === 'PUBLISH' && msg.payload.election?.id) {
            setSelectedElectionId(msg.payload.election.id);
          }
          loadElections();
        } else if (msg.type === 'ELECTION_UPDATED' || msg.type === 'ELECTION_CREATED') {
          if (msg.payload?.id && msg.payload?.status === 'published') {
            setSelectedElectionId(msg.payload.id);
          }
          loadElections();
        }
      },
      () => {
        // WebSocket connection status - does not override physical serial status
      }
    );

    return () => {
      clearInterval(pollInterval);
      cleanupWs();
    };
  }, [loadElections, checkHardware, updateHardwareStatus]);

  // Selected election object for details view
  const selectedElection = elections.find((e) => e.id === selectedElectionId);

  // Live election object
  const liveElection = elections.find((e) => e.status === 'live');

  // Handle create election submit
  async function handleCreateElection(payload) {
    const res = await createElection(payload);
    await loadElections();
    if (res.election?.status === 'live') {
      setSelectedElectionId(res.election.id);
      setCurrentView('details');
    }
  }

  // Handle start live polling
  async function handleStartLive(id) {
    await startElectionLive(id);
    await loadElections();
  }

  // Handle publish results
  async function handlePublish(id) {
    await publishElection(id);
    await loadElections();
  }

  // Handle delete election
  async function handleDelete(id) {
    if (!confirm('Are you sure you want to permanently delete this election?')) return;
    await deleteElection(id);
    await loadElections();
    setCurrentView('elections');
    setSelectedElectionId(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col w-full max-w-full overflow-x-hidden">
      {/* Top Navigation Header */}
      <Header
        currentView={currentView}
        setCurrentView={(view) => {
          setCurrentView(view);
          if (view !== 'details') setSelectedElectionId(null);
        }}
        isHardwareConnected={isHardwareConnected}
        onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
      />

      {/* Main View Router */}
      <main className="flex-1 w-full max-w-full min-w-0 overflow-x-hidden">
        {currentView === 'dashboard' && (
          <Dashboard
            elections={elections}
            counts={counts}
            isHardwareConnected={isHardwareConnected}
            onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
            onSelectElection={(id) => {
              setSelectedElectionId(id);
              setCurrentView('details');
            }}
            onNavigateToElections={() => setCurrentView('elections')}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
          />
        )}

        {currentView === 'elections' && (
          <ElectionsList
            elections={elections}
            counts={counts}
            onSelectElection={(id) => {
              setSelectedElectionId(id);
              setCurrentView('details');
            }}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
          />
        )}

        {currentView === 'details' && (
          <ElectionDetails
            election={selectedElection || liveElection}
            isHardwareConnected={isHardwareConnected}
            onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
            onBack={() => {
              setCurrentView('elections');
              setSelectedElectionId(null);
            }}
            onStartLive={handleStartLive}
            onPublish={handlePublish}
            onDelete={handleDelete}
          />
        )}

        {currentView === 'instructions' && (
          <InstructionsGuide
            isHardwareConnected={isHardwareConnected}
            onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
            onNavigateToCreate={() => setIsCreateModalOpen(true)}
            onNavigateToDashboard={() => setCurrentView('dashboard')}
          />
        )}
      </main>

      {/* 3-Step Create Election Modal */}
      <CreateElectionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateElection}
      />

      {/* Hardware Monitor / Push Button Console */}
      <HardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        isHardwareConnected={isHardwareConnected}
        isTestMode={isTestMode}
        setIsTestMode={setIsTestMode}
        liveElection={liveElection}
        publishedElection={selectedElection?.status === 'published' ? selectedElection : elections.find((e) => e.status === 'published')}
        lastHardwareEvent={lastHardwareEvent}
        onNavigateToInstructions={() => setCurrentView('instructions')}
      />

      {/* Floating Hardware Disconnect / Reconnect Side Modal Alert */}
      {hardwareNotice && (
        <aside
          role="alert"
          aria-live="assertive"
          className="hardware-side-modal"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            width: '360px',
            maxWidth: 'calc(100vw - 32px)',
            background: hardwareNotice.type === 'disconnected' ? '#FEF2F2' : '#F0FDF4',
            border: `2px solid ${hardwareNotice.type === 'disconnected' ? '#F87171' : '#4ADE80'}`,
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            transition: 'all 0.25s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px', lineHeight: 1 }}>
                {hardwareNotice.type === 'disconnected' ? '⚠️' : '🟢'}
              </span>
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 800,
                    color: hardwareNotice.type === 'disconnected' ? '#991B1B' : '#065F46'
                  }}
                >
                  {hardwareNotice.title}
                </h4>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: hardwareNotice.type === 'disconnected' ? '#DC2626' : '#16A34A',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}
                >
                  {hardwareNotice.type === 'disconnected' ? 'Action Required' : 'Ready for Voting'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setHardwareNotice(null)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                color: hardwareNotice.type === 'disconnected' ? '#991B1B' : '#065F46',
                cursor: 'pointer',
                padding: '0 4px',
                fontWeight: 700,
                lineHeight: 1
              }}
              title="Dismiss notice"
            >
              &times;
            </button>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: '12px',
              color: hardwareNotice.type === 'disconnected' ? '#7F1D1D' : '#14532D',
              lineHeight: 1.45
            }}
          >
            {hardwareNotice.message}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button
              className="btn-outline"
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '6px',
                background: '#FFFFFF',
                borderColor: hardwareNotice.type === 'disconnected' ? '#FCA5A5' : '#86EFAC',
                color: hardwareNotice.type === 'disconnected' ? '#991B1B' : '#065F46',
                cursor: 'pointer'
              }}
              onClick={() => {
                setIsHardwareModalOpen(true);
                setHardwareNotice(null);
              }}
            >
              Open Console
            </button>
            <button
              className="btn-outline"
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid transparent',
                color: '#64748B',
                cursor: 'pointer'
              }}
              onClick={() => setHardwareNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
