import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ElectionsList from './components/ElectionsList';
import ElectionDetails from './components/ElectionDetails';
import CreateElectionModal from './components/CreateElectionModal';
import HardwareModal from './components/HardwareModal';
import {
  fetchElections,
  createElection,
  startElectionLive,
  publishElection,
  deleteElection,
  fetchHardwareStatus,
  connectWebSocket
} from './services/api';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'elections', 'details'
  const [selectedElectionId, setSelectedElectionId] = useState(null);
  const [elections, setElections] = useState([]);
  const [counts, setCounts] = useState({ total: 0, draft: 0, live: 0, published: 0 });
  const [loading, setLoading] = useState(true);
  const [isHardwareConnected, setIsHardwareConnected] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);

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

  // Check hardware connection
  const checkHardware = useCallback(async () => {
    try {
      const data = await fetchHardwareStatus();
      setIsHardwareConnected(data.connected);
    } catch (e) {
      setIsHardwareConnected(false);
    }
  }, []);

  useEffect(() => {
    loadElections();
    checkHardware();

    // Setup live WebSocket telemetry
    const cleanupWs = connectWebSocket(
      (msg) => {
        console.log('[WS INCOMING]', msg);
        if (msg.type === 'VOTE_CAST') {
          // Live vote update: increment candidate votes in state
          const { electionId, candidateId, candidateVotes } = msg.payload;
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
        } else if (msg.type === 'ELECTION_UPDATED' || msg.type === 'ELECTION_CREATED' || msg.type === 'HARDWARE_EVENT') {
          // Full sync on status transitions
          loadElections();
        }
      },
      (isConnected) => {
        setIsHardwareConnected(isConnected);
      }
    );

    return () => cleanupWs();
  }, [loadElections, checkHardware]);

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
    <div className="min-h-screen bg-slate-50 flex flex-col">
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
      <main className="flex-1">
        {currentView === 'dashboard' && (
          <Dashboard
            elections={elections}
            counts={counts}
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
            onBack={() => {
              setCurrentView('elections');
              setSelectedElectionId(null);
            }}
            onStartLive={handleStartLive}
            onPublish={handlePublish}
            onDelete={handleDelete}
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
        liveElection={liveElection}
      />
    </div>
  );
}
