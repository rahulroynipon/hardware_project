import React, { useState } from 'react';
import { castVote, triggerHardwareAction } from '../services/api';

export default function HardwareModal({ isOpen, onClose, isHardwareConnected, liveElection }) {
  const [loadingSlot, setLoadingSlot] = useState(null);
  const [feedback, setFeedback] = useState('');

  if (!isOpen) return null;

  async function handleSimulateVote(slot) {
    setLoadingSlot(slot);
    setFeedback('');
    try {
      const res = await castVote(slot);
      setFeedback(`Vote recorded for Candidate ${slot}! (${res.result?.candidate?.name})`);
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

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '580px' }}>
        <button className="modal-close-btn" onClick={onClose}>&times;</button>
        <h2 className="modal-title">Hardware Console & Bridge</h2>

        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: isHardwareConnected ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${isHardwareConnected ? '#A7F3D0' : '#FDE68A'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: isHardwareConnected ? '#065F46' : '#92400E' }}>
            <span className="pulse-dot" style={{ background: isHardwareConnected ? '#10B981' : '#F59E0B' }}></span>
            <span>{isHardwareConnected ? 'Arduino Uno Connected via Express USB Bridge' : 'Arduino Serial Bridge Listening (/dev/cu.usbmodem11201)'}</span>
          </div>
          <p style={{ fontSize: '12px', color: isHardwareConnected ? '#047857' : '#B45309', marginTop: '4px' }}>
            {liveElection ? `Active Live Polling: "${liveElection.title}" (${liveElection.candidates?.length || 4} Candidates)` : 'No live election. Pressing Start on Arduino will auto-generate an instant 4-candidate election.'}
          </p>
        </div>

        {feedback && (
          <div style={{ padding: '8px 12px', background: '#F1F5F9', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginBottom: '14px', fontWeight: 600 }}>
            {feedback}
          </div>
        )}

        {/* Simulate Voting (Slots A, B, C, D) */}
        <div style={{ marginBottom: '20px' }}>
          <label className="form-label">Simulate Push Buttons (Pins D3, D4, D5, D6)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {['A', 'B', 'C', 'D'].map((slot, idx) => {
              const activeCount = liveElection?.candidates?.length || 4;
              const isDisabled = idx >= activeCount;
              return (
                <button
                  key={slot}
                  className="btn-outline"
                  style={{
                    padding: '12px 8px',
                    fontWeight: 800,
                    fontSize: '14px',
                    opacity: isDisabled ? 0.4 : 1,
                    borderColor: isDisabled ? '#CBD5E1' : 'var(--primary)'
                  }}
                  disabled={isDisabled || loadingSlot === slot}
                  onClick={() => handleSimulateVote(slot)}
                >
                  {loadingSlot === slot ? '...' : `Btn ${slot} (D${idx + 3})`}
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {isDisabled ? 'Disabled' : `Slot ${slot}`}
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
            <button className="btn-outline" onClick={() => handleTriggerAction('PUBLISH')}>
              Publish Results (1 Click)
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
          </div>
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
