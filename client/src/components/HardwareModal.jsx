import React, { useState } from 'react';
import { castVote, triggerHardwareAction, flashHardwareFirmware, syncLiveElectionToHardware } from '../services/api';

export default function HardwareModal({ isOpen, onClose, isHardwareConnected, liveElection, publishedElection }) {
  const [loadingSlot, setLoadingSlot] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (!isOpen) return null;

  const isPublished = !liveElection && !!publishedElection;

  async function handleSimulateVote(slot) {
    if (isPublished) {
      setFeedback(`🏆 Voting is closed! "${publishedElection.title}" is published (Winner: ${publishedElection.winner || 'Finalized'}). Push buttons are disabled.`);
      return;
    }

    setLoadingSlot(slot);
    setFeedback('');
    try {
      const res = await castVote(slot);
      if (res.isPublished) {
        setFeedback(`🏆 ${res.error || `Voting is closed. Winner: ${res.winner}`}`);
      } else {
        setFeedback(`Vote recorded for Candidate ${slot}! (${res.result?.candidate?.name}) • Arduino LCD display updated`);
      }
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setLoadingSlot(null);
    }
  }

  async function handleTriggerAction(action) {
    try {
      await triggerHardwareAction(action);
      setFeedback(`Action triggered: ${action}`);
    } catch (err) {
      setFeedback(`Action error: ${err.message}`);
    }
  }

  async function handleSyncLiveVotes() {
    setIsSyncing(true);
    setFeedback('Loading existing election votes from database to Arduino...');
    try {
      const res = await syncLiveElectionToHardware();
      const t = res.tallies;
      setFeedback(`✅ Loaded into Arduino LCD: A:${t.A} B:${t.B} C:${t.C} D:${t.D} ("${res.election}")`);
    } catch (err) {
      setFeedback(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleFlashFirmware() {
    setIsFlashing(true);
    setFeedback('Compiling & uploading firmware to Arduino Uno...');
    try {
      const res = await flashHardwareFirmware();
      setFeedback(`Firmware successfully uploaded to Arduino Uno! (${res.message || 'Ready'})`);
    } catch (err) {
      setFeedback(`Upload failed: ${err.message}`);
    } finally {
      setIsFlashing(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '580px' }}>
        <button className="modal-close-btn" onClick={onClose}>&times;</button>
        <h2 className="modal-title">Hardware Console & Bridge</h2>

        {/* Status / Live Polling Banner */}
        {isPublished ? (
          <div style={{ marginBottom: '16px', padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: '#991B1B' }}>
                <span>🏆 Election Published & Sealed</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#FEE2E2', color: '#991B1B' }}>
                Voting Closed
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#B91C1C', marginTop: '6px', fontWeight: 700 }}>
              "{publishedElection.title}" — Official Winner: <span style={{ textDecoration: 'underline' }}>{publishedElection.winner || 'Completed'}</span>
            </p>
            <p style={{ fontSize: '11px', color: '#7F1D1D', marginTop: '3px' }}>
              Push buttons (Pins D3, D4, D5, D6) and Publish actions are disabled. Click "Start Live" below to start a new election.
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: isHardwareConnected ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${isHardwareConnected ? '#A7F3D0' : '#FDE68A'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: isHardwareConnected ? '#065F46' : '#92400E' }}>
              <span className="pulse-dot" style={{ background: isHardwareConnected ? '#10B981' : '#F59E0B' }}></span>
              <span>{isHardwareConnected ? 'Arduino Uno Connected via Express USB Bridge' : 'Arduino Serial Bridge Listening (/dev/cu.usbmodem11201)'}</span>
            </div>
            <p style={{ fontSize: '12px', color: isHardwareConnected ? '#047857' : '#B45309', marginTop: '4px' }}>
              {liveElection ? `Active Live Polling: "${liveElection.title}" (${liveElection.candidates?.length || 4} Candidates)` : 'No live election. Pressing Start Live will begin a new election session.'}
            </p>
          </div>
        )}

        {feedback && (
          <div style={{ padding: '8px 12px', background: '#F1F5F9', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginBottom: '14px', fontWeight: 600 }}>
            {feedback}
          </div>
        )}

        {/* Simulate Voting (Slots A, B, C, D) */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Simulate Push Buttons (Pins D3, D4, D5, D6)</label>
            {isPublished && (
              <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 700 }}>Buttons Disabled (Voting Closed)</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {['A', 'B', 'C', 'D'].map((slot, idx) => {
              const activeCount = liveElection?.candidates?.length || (isPublished ? (publishedElection?.candidates?.length || 4) : 4);
              const isDisabled = isPublished || idx >= activeCount;
              return (
                <button
                  key={slot}
                  className="btn-outline"
                  style={{
                    padding: '12px 8px',
                    fontWeight: 800,
                    fontSize: '14px',
                    opacity: isDisabled ? 0.35 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    borderColor: isDisabled ? '#CBD5E1' : 'var(--primary)',
                    background: isPublished ? '#F8FAFC' : 'transparent'
                  }}
                  disabled={isDisabled || loadingSlot === slot}
                  onClick={() => handleSimulateVote(slot)}
                >
                  {loadingSlot === slot ? '...' : `Btn ${slot} (D${idx + 3})`}
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {isPublished ? 'Closed' : (idx >= activeCount ? 'Disabled' : `Slot ${slot}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hardware Control Actions */}
        <div style={{ marginBottom: '20px' }}>
          <label className="form-label">Control Pin 7 Hardware Actions</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn-outline" onClick={() => handleTriggerAction('START')}>
              Start Live (1 Click)
            </button>
            <button
              className="btn-outline"
              disabled={isPublished}
              style={{
                opacity: isPublished ? 0.4 : 1,
                cursor: isPublished ? 'not-allowed' : 'pointer'
              }}
              onClick={() => handleTriggerAction('PUBLISH')}
            >
              {isPublished ? 'Published (Completed)' : 'Publish Results (1 Click)'}
            </button>
            <button className="btn-outline" onClick={() => handleTriggerAction('RESET')}>
              Reset Counts (3s)
            </button>
            <button className="btn-outline" onClick={() => handleTriggerAction('POWER_OFF')}>
              Display Sleep (5s)
            </button>
            <button className="btn-outline" onClick={() => handleTriggerAction('POWER_ON')}>
              Display Wake (5s)
            </button>
            <button
              className="btn-outline"
              style={{ background: '#F0FDF4', borderColor: '#86EFAC', color: '#166534', fontWeight: 700 }}
              disabled={isSyncing}
              onClick={handleSyncLiveVotes}
            >
              {isSyncing ? '🔄 Loading...' : '🔄 Load Live Votes to LCD'}
            </button>
          </div>
        </div>

        {/* Upload Firmware Action */}
        <div style={{ marginBottom: '24px', paddingTop: '14px', borderTop: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Arduino Sketch Firmware</label>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Terminal: <code>npm run upload</code></span>
          </div>
          <button
            className="btn-outline"
            style={{ width: '100%', borderColor: '#3B82F6', color: '#1D4ED8', fontWeight: 700, padding: '10px' }}
            disabled={isFlashing}
            onClick={handleFlashFirmware}
          >
            {isFlashing ? '⏳ Compiling & Uploading to Arduino Uno...' : '⚡ Upload Code to Arduino Uno'}
          </button>
        </div>

        <div style={{ textAlign: 'right' }}>
          <button className="btn-primary" onClick={onClose}>
            Close Console
          </button>
        </div>
      </div>
    </div>
  );
}
