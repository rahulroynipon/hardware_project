import React, { useState, useEffect, useRef } from 'react';
import { castVote, triggerHardwareAction, syncLiveElectionToHardware } from '../services/api';

export default function HardwareModal({
  isOpen,
  onClose,
  isHardwareConnected,
  liveElection,
  publishedElection,
  lastHardwareEvent
}) {
  const [loadingSlot, setLoadingSlot] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeLcdView, setActiveLcdView] = useState('WINNER'); // 'WINNER', 'TOTAL', 'A', 'B', 'C', 'D'
  const [isPoweredOn, setIsPoweredOn] = useState(true);
  const [greenBlink, setGreenBlink] = useState(false);

  // Temporary transition screens (800ms - 1500ms duration matching Arduino Uno showMessage)
  const [tempMessage, setTempMessage] = useState(null);
  const tempTimerRef = useRef(null);

  function triggerTempMessage(row0, row1, durationMs = 800) {
    if (tempTimerRef.current) {
      clearTimeout(tempTimerRef.current);
    }
    setTempMessage({ row0, row1 });
    tempTimerRef.current = setTimeout(() => {
      setTempMessage(null);
    }, durationMs);
  }

  useEffect(() => {
    return () => {
      if (tempTimerRef.current) clearTimeout(tempTimerRef.current);
    };
  }, []);

  // Machine mode tracks Arduino Uno MachineState: 'STANDBY', 'VOTING', 'PUBLISHED'
  const [machineMode, setMachineMode] = useState(() => {
    if (liveElection) return 'VOTING';
    if (publishedElection) return 'PUBLISHED';
    return 'STANDBY';
  });

  // Keep machineMode aligned when props change
  useEffect(() => {
    if (liveElection) {
      setMachineMode('VOTING');
    } else if (publishedElection) {
      // If we are in STANDBY from a reset, do not force published unless requested
      if (machineMode !== 'STANDBY') {
        setMachineMode('PUBLISHED');
      }
    }
  }, [liveElection, publishedElection]);

  function normalizeSlot(raw) {
    if (!raw) return 'WINNER';
    const s = String(raw).toUpperCase().trim();
    if (s === 'W' || s === '5' || s === 'WINNER') return 'WINNER';
    if (s === 'T' || s === '0' || s === 'TOTAL') return 'TOTAL';
    if (s === '1' || s === 'A') return 'A';
    if (s === '2' || s === 'B') return 'B';
    if (s === '3' || s === 'C') return 'C';
    if (s === '4' || s === 'D') return 'D';
    return s;
  }

  // Sync state when incoming physical hardware button events occur
  useEffect(() => {
    if (!lastHardwareEvent) return;

    const action = lastHardwareEvent.action;
    if (action === 'VOTE_CAST') {
      const slot = (lastHardwareEvent.slot || 'A').toUpperCase();
      setGreenBlink(true);
      setTimeout(() => setGreenBlink(false), 120);
      triggerTempMessage('Vote Recorded', `Candidate ${slot}`, 800);
    } else if (action === 'VOTE_BLOCKED') {
      const isNotStarted = (lastHardwareEvent.reason === 'VotingNotStarted') || (machineMode === 'STANDBY');
      const row0 = isNotStarted ? 'NOT STARTED' : 'RESULT PUBLISHED';
      const row1 = isNotStarted ? 'Press to Start' : 'Voting is closed';
      if (!tempMessage || tempMessage.row0 !== row0) {
        triggerTempMessage(row0, row1, 1500);
      }
    } else if (action === 'RESET') {
      setMachineMode('STANDBY');
      setIsPoweredOn(true);
      triggerTempMessage('VOTES RESET', 'Press to Start', 1500);
    } else if (action === 'START') {
      setMachineMode('VOTING');
      setIsPoweredOn(true);
      triggerTempMessage('VOTING STARTED', 'Cast your vote!', 1200);
    } else if (action === 'PUBLISH') {
      setMachineMode('PUBLISHED');
      setActiveLcdView('WINNER');
      setIsPoweredOn(true);
      triggerTempMessage('RESULT PUBLISHED', 'Voting is closed', 1200);
    } else if (action === 'INSPECT' && lastHardwareEvent.slot) {
      setMachineMode('PUBLISHED');
      const slot = normalizeSlot(lastHardwareEvent.slot);
      setActiveLcdView(slot);
      setIsPoweredOn(true);
    } else if (action === 'POWER_OFF') {
      triggerTempMessage(' POWERING OFF...', '', 800);
      setTimeout(() => {
        setIsPoweredOn(false);
      }, 800);
    } else if (action === 'POWER_ON') {
      setIsPoweredOn(true);
      triggerTempMessage(' POWERING ON... ', '', 1000);
    }
  }, [lastHardwareEvent]);

  if (!isOpen) return null;

  const isStandby = machineMode === 'STANDBY';
  const isVoting = machineMode === 'VOTING';
  const isPublished = machineMode === 'PUBLISHED';

  // LED states mirroring Arduino Uno physical pins
  const isGreenLedLit = isPoweredOn && isVoting;
  const isRedLedLit = isPoweredOn && isPublished;

  // Calculate LCD lines matching Arduino Uno exact formatting (lines 191-218 of ino)
  function getLcdLines() {
    const pad16 = (str) => (str + '                ').substring(0, 16);
    const pad4 = (num) => {
      const s = String(num != null ? num : 0);
      return (s + '    ').substring(0, 4);
    };

    // 0. Temporary transition screens (matching Arduino Uno showMessage, e.g. "Vote Recorded", "VOTING STARTED")
    if (tempMessage) {
      return {
        row0: pad16(tempMessage.row0),
        row1: pad16(tempMessage.row1)
      };
    }

    // 1. Powered OFF State: completely dark / blank
    if (!isPoweredOn) {
      return {
        row0: pad16(''),
        row1: pad16('')
      };
    }

    // 2. STANDBY State (Matching digital_voting_machine.ino lines 191-197)
    if (isStandby) {
      return {
        row0: pad16('TO START VOTING'),
        row1: pad16('PRESS TO START')
      };
    }

    // 3. VOTING State (Matching digital_voting_machine.ino lines 199-218)
    if (isVoting) {
      const candidates = liveElection?.candidates || [];
      const candCount = candidates.length > 0 ? candidates.length : 4;
      const getVotes = (slot) => {
        const c = candidates.find((x) => (x.slot || '').toUpperCase() === slot);
        return c ? c.votes || 0 : 0;
      };

      const vA = getVotes('A');
      const vB = getVotes('B');
      const vC = getVotes('C');
      const vD = getVotes('D');

      const row0 = pad16(`A:${pad4(vA)}  B:${pad4(vB)}`);

      let row1 = '';
      if (candCount === 2) {
        row1 = pad16('[2 CANDIDATES]');
      } else if (candCount === 3) {
        row1 = pad16(`C:${pad4(vC)}  [3 CAND]`);
      } else {
        row1 = pad16(`C:${pad4(vC)}  D:${pad4(vD)}`);
      }

      return { row0, row1 };
    }

    // 4. PUBLISHED State (Matching digital_voting_machine.ino lines 263-317)
    if (isPublished) {
      const candidates = (publishedElection || liveElection)?.candidates || [];
      const total = candidates.reduce((sum, c) => sum + (c.votes || 0), 0);
      const candCount = candidates.length > 0 ? candidates.length : 4;

      if (activeLcdView === 'TOTAL') {
        const totStr = String(total);
        return {
          row0: pad16('TOTAL VOTES'),
          row1: pad16(`Total: ${totStr}`)
        };
      }

      if (['A', 'B', 'C', 'D'].includes(activeLcdView)) {
        const slotIdx = activeLcdView.charCodeAt(0) - 65;
        if (slotIdx < candCount) {
          const cand = candidates.find((c) => (c.slot || '').toUpperCase() === activeLcdView);
          const votes = cand ? cand.votes || 0 : 0;
          const pct = total > 0 ? ((votes * 100) / total).toFixed(1) : '0.0';
          return {
            row0: pad16(`Candidate ${activeLcdView}`),
            row1: pad16(`V:${pad4(votes)} ${pct}%`)
          };
        } else {
          return {
            row0: pad16(`Candidate ${activeLcdView}`),
            row1: pad16('SLOT DISABLED')
          };
        }
      }

      // Default: WINNER screen (Page 5)
      let highest = 0;
      let winnerSlot = 'A';
      let winnerCount = 0;

      candidates.forEach((c) => {
        const v = c.votes || 0;
        if (v > highest) {
          highest = v;
          winnerSlot = (c.slot || 'A').toUpperCase();
          winnerCount = 1;
        } else if (v === highest && highest > 0) {
          winnerCount++;
        }
      });

      if (total === 0) {
        return {
          row0: pad16('NO VOTES CAST'),
          row1: pad16('Total: 0')
        };
      } else if (winnerCount > 1) {
        return {
          row0: pad16('TIE - WINNER'),
          row1: pad16(`Top votes: ${highest}`)
        };
      } else {
        const winnerPct = total > 0 ? Math.round((highest * 100) / total) : 0;
        return {
          row0: pad16(`WINNER: Cand ${winnerSlot}`),
          row1: pad16(`V:${pad4(highest)} (${winnerPct}%)`)
        };
      }
    }

    return {
      row0: pad16('TO START VOTING'),
      row1: pad16('PRESS TO START')
    };
  }

  const lcd = getLcdLines();

  async function handleSimulateVote(slot) {
    if (!isPoweredOn) return;

    if (isPublished) {
      triggerTempMessage('RESULT PUBLISHED', 'Voting is closed', 1500);
      castVote(slot).catch(() => {});
      return;
    }

    if (isStandby) {
      triggerTempMessage('NOT STARTED', 'Press to Start', 1500);
      castVote(slot).catch(() => {});
      return;
    }

    setLoadingSlot(slot);
    setGreenBlink(true);
    setTimeout(() => setGreenBlink(false), 120);
    triggerTempMessage('Vote Recorded', `Candidate ${slot}`, 800);

    try {
      await castVote(slot);
    } catch (err) {
      console.error('[VOTE ERR]', err);
    } finally {
      setLoadingSlot(null);
    }
  }

  async function handleTriggerAction(action) {
    if (action === 'START') {
      setMachineMode('VOTING');
      setIsPoweredOn(true);
      triggerTempMessage('VOTING STARTED', 'Cast your vote!', 1200);
    } else if (action === 'PUBLISH') {
      if (isPublished) {
        setActiveLcdView('WINNER');
        await triggerHardwareAction('SHOW_WINNER');
        return;
      }
      setMachineMode('PUBLISHED');
      setActiveLcdView('WINNER');
      triggerTempMessage('RESULT PUBLISHED', 'Voting is closed', 1200);
    } else if (action === 'RESET') {
      setMachineMode('STANDBY');
      setIsPoweredOn(true);
      triggerTempMessage('VOTES RESET', 'Press to Start', 1500);
    } else if (action === 'POWER_OFF') {
      triggerTempMessage(' POWERING OFF...', '', 800);
      setTimeout(() => {
        setIsPoweredOn(false);
      }, 800);
    } else if (action === 'POWER_ON') {
      setIsPoweredOn(true);
      triggerTempMessage(' POWERING ON... ', '', 1000);
    } else if (action === 'CYCLE_STATS') {
      const order = ['WINNER', 'TOTAL', 'A', 'B', 'C', 'D'];
      const nextIdx = (order.indexOf(activeLcdView) + 1) % order.length;
      const nextSlot = order[nextIdx];
      setActiveLcdView(nextSlot);
      await triggerHardwareAction('CYCLE_STATS');
      return;
    } else if (action === 'SHOW_TOTAL') {
      setActiveLcdView('TOTAL');
      await triggerHardwareAction('SHOW_TOTAL');
      return;
    }

    try {
      await triggerHardwareAction(action);
    } catch (err) {
      console.error('[ACTION ERR]', err);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      await syncLiveElectionToHardware();
    } catch (err) {
      console.error('[SYNC ERR]', err);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '620px' }}>
        <button className="modal-close-btn" onClick={onClose}>&times;</button>
        <h2 className="modal-title" style={{ marginBottom: '14px' }}>Hardware Console & Bridge</h2>

        {/* CONNECTION & PHYSICAL LEDS IN-LINE STATUS */}
        <div
          style={{
            marginBottom: '14px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: isHardwareConnected ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${isHardwareConnected ? '#BBF7D0' : '#FDE68A'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          {/* Bridge Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pulse-dot" style={{ background: isHardwareConnected ? '#10B981' : '#F59E0B' }}></span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: isHardwareConnected ? '#065F46' : '#92400E' }}>
              {isHardwareConnected ? 'Arduino Uno Connected (/dev/cu.usbmodem11201)' : 'Arduino Serial Bridge Listening'}
            </span>
          </div>

          {/* PHYSICAL ARDUINO HARDWARE LEDS (PINS D8 & D9) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Green LED (Pin D8) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: (isGreenLedLit || greenBlink) ? '#22C55E' : '#14532D',
                  boxShadow: (isGreenLedLit || greenBlink)
                    ? '0 0 10px #22C55E, inset 0 1px 2px rgba(255,255,255,0.7)'
                    : 'inset 0 1px 2px rgba(0,0,0,0.6)',
                  border: '1px solid #166534',
                  transition: 'all 0.1s ease'
                }}
              ></span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: (isGreenLedLit || greenBlink) ? '#15803D' : '#64748B' }}>
                Green LED (D8): {(isGreenLedLit || greenBlink) ? 'ON' : 'OFF'}
              </span>
            </div>

            {/* Red LED (Pin D9) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: isRedLedLit ? '#EF4444' : '#7F1D1D',
                  boxShadow: isRedLedLit
                    ? '0 0 10px #EF4444, inset 0 1px 2px rgba(255,255,255,0.7)'
                    : 'inset 0 1px 2px rgba(0,0,0,0.6)',
                  border: '1px solid #991B1B',
                  transition: 'all 0.1s ease'
                }}
              ></span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: isRedLedLit ? '#B91C1C' : '#64748B' }}>
                Red LED (D9): {isRedLedLit ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
        </div>

        {/* REAL-TIME 1602 LCD SIMULATOR (I2C 0X27) */}
        <div
          style={{
            marginBottom: '16px',
            background: '#0F172A',
            borderRadius: '12px',
            padding: '12px 16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: '2px solid #334155'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isPoweredOn ? '#38BDF8' : '#475569',
                  boxShadow: isPoweredOn ? '0 0 6px #38BDF8' : 'none'
                }}
              ></span>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Physical 1602 LCD Display (I2C 0x27)
              </span>
            </div>
            <span style={{ fontSize: '11px', color: isPoweredOn ? '#38BDF8' : '#64748B', fontWeight: 700 }}>
              {!isPoweredOn
                ? 'Display Sleeping'
                : isStandby
                ? 'Standby Mode'
                : isVoting
                ? 'Active Polling'
                : `Published (${activeLcdView})`}
            </span>
          </div>

          {/* LCD Screen Bezel */}
          <div
            style={{
              background: isPoweredOn ? '#0284C7' : '#0B1120',
              border: `3px solid ${isPoweredOn ? '#0369A1' : '#1E293B'}`,
              borderRadius: '6px',
              padding: '10px 14px',
              boxShadow: isPoweredOn ? 'inset 0 2px 8px rgba(0,0,0,0.4)' : 'inset 0 2px 4px rgba(0,0,0,0.8)',
              color: isPoweredOn ? '#F0F9FF' : '#1E293B',
              fontFamily: '"Courier New", Courier, monospace',
              fontWeight: 900,
              fontSize: '17px',
              letterSpacing: '2px',
              lineHeight: 1.4,
              textShadow: isPoweredOn ? '0 0 4px rgba(255,255,255,0.7)' : 'none',
              userSelect: 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ whiteSpace: 'pre' }}>{lcd.row0}</div>
            <div style={{ whiteSpace: 'pre' }}>{lcd.row1}</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: '#64748B' }}>
            <span>Row 0: 16 Chars</span>
            <span>Point-to-Point Sync: Arduino • Database • Display</span>
            <span>Row 1: 16 Chars</span>
          </div>
        </div>

        {/* PUSH BUTTONS (PINS D3, D4, D5, D6) */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>
              {isPublished
                ? 'Push Buttons (Pins D3, D4, D5, D6) - Voting Closed'
                : isStandby
                ? 'Push Buttons (Pins D3, D4, D5, D6) - Standby Mode'
                : 'Push Buttons (Pins D3, D4, D5, D6)'}
            </label>
            {isPublished && (
              <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700 }}>
                Displaying on LCD: {activeLcdView}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {['A', 'B', 'C', 'D'].map((slot, idx) => {
              const activeSource = isVoting ? liveElection : (publishedElection || liveElection);
              const cand = activeSource?.candidates?.find(
                (c) => (c.slot || '').toUpperCase() === slot.toUpperCase()
              );
              const activeCount = isVoting
                ? (liveElection?.candidates?.length || 4)
                : isPublished
                ? (publishedElection?.candidates?.length || 4)
                : 4;
              const isDisabled = !isPublished && !isStandby && idx >= activeCount;

              return (
                <button
                  key={slot}
                  className="btn-outline"
                  style={{
                    padding: '12px 8px',
                    fontWeight: 800,
                    fontSize: '14px',
                    cursor: 'pointer',
                    borderColor: isDisabled ? '#CBD5E1' : isPublished ? '#FCA5A5' : 'var(--primary)',
                    background: isPublished ? '#FEF2F2' : 'transparent',
                    opacity: isDisabled ? 0.35 : 1,
                    transition: 'all 0.1s ease'
                  }}
                  disabled={isDisabled || loadingSlot === slot}
                  onClick={() => handleSimulateVote(slot)}
                >
                  {loadingSlot === slot
                    ? '...'
                    : `Btn ${slot} (D${idx + 3})`}
                  <span
                    style={{
                      display: 'block',
                      fontSize: '10px',
                      color: isPublished ? '#DC2626' : 'var(--text-muted)',
                      fontWeight: 600
                    }}
                  >
                    {isStandby
                      ? `Slot ${slot}`
                      : isPublished
                      ? 'Voting Closed'
                      : idx >= activeCount
                      ? 'Disabled'
                      : cand
                      ? `${cand.votes} votes`
                      : `Slot ${slot}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CONTROL PIN 7 HARDWARE ACTIONS */}
        <div style={{ marginBottom: '18px' }}>
          <label className="form-label">Control Pin 7 Hardware Actions</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn-outline" onClick={() => handleTriggerAction('START')}>
              {isStandby ? 'Start Voting (1 Click)' : isPublished ? 'Start New Live (1 Click)' : 'Restart Live (1 Click)'}
            </button>

            {/* Only show Publish Results button when voting has actively started */}
            {isVoting && (
              <button
                className="btn-outline"
                style={{
                  cursor: 'pointer',
                  borderColor: '#DC2626',
                  color: '#991B1B',
                  fontWeight: 700
                }}
                onClick={() => handleTriggerAction('PUBLISH')}
              >
                Publish Results (1 Click)
              </button>
            )}

            {/* When results are published, show the winner view button */}
            {isPublished && (
              <button
                className="btn-outline"
                style={{
                  cursor: 'pointer',
                  borderColor: '#10B981',
                  color: '#065F46',
                  background: activeLcdView === 'WINNER' ? '#A7F3D0' : '#ECFDF5',
                  fontWeight: 800,
                  boxShadow: activeLcdView === 'WINNER' ? '0 0 0 2px #10B981' : undefined
                }}
                onClick={() => handleTriggerAction('PUBLISH')}
              >
                🏆 Show Winner (LCD)
              </button>
            )}

            {isPublished && (
              <>
                <button
                  className="btn-outline"
                  style={{
                    background: activeLcdView === 'TOTAL' ? '#E2E8F0' : '#F8FAFC',
                    borderColor: '#94A3B8',
                    color: '#334155',
                    fontWeight: 700
                  }}
                  onClick={() => handleTriggerAction('SHOW_TOTAL')}
                >
                  👥 Total Votes (LCD)
                </button>
                <button
                  className="btn-outline"
                  style={{ background: '#F8FAFC', borderColor: '#94A3B8', color: '#334155', fontWeight: 700 }}
                  onClick={() => handleTriggerAction('CYCLE_STATS')}
                >
                  📊 Cycle LCD Screens
                </button>
              </>
            )}

            <button className="btn-outline" onClick={() => handleTriggerAction('RESET')}>
              {isStandby ? 'Clear Counts (3s)' : 'Reset to Standby (3s)'}
            </button>

            {isPoweredOn ? (
              <button className="btn-outline" onClick={() => handleTriggerAction('POWER_OFF')}>
                Display Sleep (5s)
              </button>
            ) : (
              <button className="btn-outline" onClick={() => handleTriggerAction('POWER_ON')}>
                Display Wake (5s)
              </button>
            )}

            <button
              className="btn-outline"
              style={{
                background: '#F0FDF4',
                borderColor: '#86EFAC',
                color: '#166534',
                fontWeight: 700
              }}
              disabled={isSyncing}
              onClick={handleSync}
            >
              {isSyncing ? '🔄 Syncing...' : '🔄 Sync with Hardware'}
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
