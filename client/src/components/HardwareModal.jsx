import React, { useState, useEffect, useRef } from 'react';
import { castVote, sendTestVote, setHardwareTestMode, triggerHardwareAction, syncLiveElectionToHardware } from '../services/api';

export default function HardwareModal({
  isOpen,
  onClose,
  isHardwareConnected,
  isTestMode = false,
  setIsTestMode,
  liveElection,
  publishedElection,
  lastHardwareEvent,
  onNavigateToInstructions
}) {
  const [loadingSlot, setLoadingSlot] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeLcdView, setActiveLcdView] = useState('WINNER'); // 'WINNER', 'TOTAL', 'A', 'B', 'C', 'D'
  const [isPoweredOn, setIsPoweredOn] = useState(true);
  const [greenBlink, setGreenBlink] = useState(false);
  const [internalTestMode, setInternalTestMode] = useState(false);
  const activeTestMode = setIsTestMode ? isTestMode : internalTestMode;
  const setTestModeState = setIsTestMode || setInternalTestMode;
  const [testTallies, setTestTallies] = useState({ A: 0, B: 0, C: 0, D: 0 });

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
      setTimeout(() => setGreenBlink(false), 500);
      triggerTempMessage('Vote Recorded', `Candidate ${slot}`, 800);
    } else if (action === 'TEST_VOTE') {
      const slot = (lastHardwareEvent.slot || 'A').toUpperCase();
      setGreenBlink(true);
      setTimeout(() => setGreenBlink(false), 500);
      triggerTempMessage('Test Vote Rec.', `Candidate ${slot}`, 800);
      setTestTallies((prev) => ({
        ...prev,
        [slot]: (prev[slot] || 0) + 1
      }));
    } else if (action === 'SYNC_START' || action === 'SYNC') {
      triggerTempMessage('HARDWARE SYNCING', 'PLEASE WAIT...  ', 2500);
      if (lastHardwareEvent.tallies && Array.isArray(lastHardwareEvent.tallies)) {
        setTestTallies({
          A: lastHardwareEvent.tallies[0] || 0,
          B: lastHardwareEvent.tallies[1] || 0,
          C: lastHardwareEvent.tallies[2] || 0,
          D: lastHardwareEvent.tallies[3] || 0
        });
      }
    } else if (action === 'MODE_SWITCH') {
      const isTest = Boolean(lastHardwareEvent.testMode);
      const modeText = isTest ? 'TEST MODE ON' : 'LIVE VOTING ON';
      triggerTempMessage('MODE SWITCHED', modeText, 2500);
      if (setIsTestMode) setIsTestMode(isTest);
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

    // 0.5. Disconnected State: show "PLEASE CONNECT / VOTING MACHINE"
    if (!isHardwareConnected) {
      return {
        row0: pad16('PLEASE CONNECT'),
        row1: pad16('VOTING MACHINE')
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
        if (isTestMode) return testTallies[slot] || 0;
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

    // In Live Voting Mode, web voting buttons are disabled (votes only accepted from physical hardware buttons)
    if (!isTestMode) {
      triggerTempMessage('LIVE MODE', 'Use Hardware D3-D6', 1500);
      return;
    }

    if (isPublished) {
      triggerTempMessage('RESULT PUBLISHED', 'Voting is closed', 1500);
      return;
    }

    if (isStandby) {
      triggerTempMessage('NOT STARTED', 'Press to Start', 1500);
      return;
    }

    setLoadingSlot(slot);
    setGreenBlink(true);
    setTimeout(() => setGreenBlink(false), 500);
    triggerTempMessage('Test Vote Rec.', `Candidate ${slot}`, 800);

    // In Test Mode: Increment local test tallies ONLY, do NOT record to official PostgreSQL database
    setTestTallies((prev) => ({
      ...prev,
      [slot]: (prev[slot] || 0) + 1
    }));

    try {
      // Sends simulated test vote to hardware for LCD/LED verification if Arduino is connected
      await sendTestVote(slot);
    } catch (err) {
      console.warn('[TEST VOTE SIM]', err.message);
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
      setTestTallies({ A: 0, B: 0, C: 0, D: 0 });
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
    if (!isHardwareConnected) {
      triggerTempMessage('NOT CONNECTED', 'Please plug in USB', 1500);
      return;
    }
    setIsSyncing(true);
    triggerTempMessage('HARDWARE SYNCING', 'PLEASE WAIT...  ', 2500);
    try {
      if (isTestMode) {
        // In Test Mode: Sync physical machine with Hardware Modal display data (Zero DB touch)
        const tallies = [testTallies.A || 0, testTallies.B || 0, testTallies.C || 0, testTallies.D || 0];
        await syncLiveElectionToHardware({
          isTestMode: true,
          state: machineMode,
          tallies,
          candidateCount: 4
        });
      } else {
        // In Live Voting Mode: Sync physical machine with PostgreSQL DB election
        await syncLiveElectionToHardware({ isTestMode: false });
      }
    } catch (err) {
      console.error('[SYNC ERR]', err);
      triggerTempMessage('SYNC FAILED', 'Check Connection', 1500);
    } finally {
      setTimeout(() => setIsSyncing(false), 2500);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '620px' }}>
        <button className="modal-close-btn" onClick={onClose}>&times;</button>
        <h2 className="modal-title" style={{ marginBottom: '14px' }}>Hardware Console & Bridge</h2>

        {/* IF DISCONNECTED: SHOW ONLY "PLEASE CONNECT THE VOTING MACHINE" */}
        {!isHardwareConnected ? (
          <div
            style={{
              padding: '44px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <div style={{ fontSize: '52px', lineHeight: 1, marginBottom: '4px' }}>🔌</div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>
              Please Connect the Voting Machine
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748B', maxWidth: '380px', lineHeight: 1.5 }}>
              The Arduino Uno voting machine is not detected on USB. Please plug in the physical voting machine to view hardware controls and choices.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button className="btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <>

        {/* COMPACT MINIMAL HARDWARE STATUS & CONTROL STRIP */}
        <div
          style={{
            marginBottom: '12px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: isHardwareConnected ? '#F8FAFC' : '#FEF2F2',
            border: `1px solid ${isHardwareConnected ? '#E2E8F0' : '#FECACA'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          {/* Left: Connection & LEDs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Port Connection */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                className="pulse-dot"
                style={{
                  width: '8px',
                  height: '8px',
                  background: isHardwareConnected ? '#10B981' : '#EF4444'
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#1E293B' }}>
                {isHardwareConnected ? 'Arduino Online' : 'Hardware Disconnected'}
              </span>
              {isHardwareConnected && (
                <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace' }}>
                  (/dev/cu.usbmodem11201)
                </span>
              )}
            </div>

            {/* Divider */}
            <span style={{ width: '1px', height: '14px', background: '#CBD5E1' }}></span>

            {/* Green LED (Pin 13) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '11px',
                  height: '11px',
                  borderRadius: '50%',
                  background: greenBlink ? '#4ADE80' : isGreenLedLit ? '#22C55E' : '#064E3B',
                  boxShadow: greenBlink
                    ? '0 0 12px #22C55E, 0 0 20px #4ADE80'
                    : isGreenLedLit
                    ? '0 0 8px #22C55E'
                    : 'none',
                  border: `1.5px solid ${greenBlink ? '#86EFAC' : isGreenLedLit ? '#16A34A' : '#022C22'}`,
                  transition: 'all 0.15s ease'
                }}
              />
              <span style={{ fontSize: '11px', color: greenBlink ? '#15803D' : isGreenLedLit ? '#15803D' : '#64748B' }}>
                Pin 13 (Green): <strong style={{ fontWeight: 800 }}>{greenBlink ? '⚡ BLINK' : isGreenLedLit ? 'ON' : 'OFF'}</strong>
              </span>
            </div>

            {/* Red LED (Pin 12) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '11px',
                  height: '11px',
                  borderRadius: '50%',
                  background: isRedLedLit ? '#EF4444' : '#450A0A',
                  boxShadow: isRedLedLit ? '0 0 8px #EF4444' : 'none',
                  border: `1.5px solid ${isRedLedLit ? '#B91C1C' : '#2D0606'}`,
                  transition: 'all 0.15s ease'
                }}
              />
              <span style={{ fontSize: '11px', color: isRedLedLit ? '#B91C1C' : '#64748B' }}>
                Pin 12 (Red): <strong style={{ fontWeight: 800 }}>{isRedLedLit ? 'ON' : 'OFF'}</strong>
              </span>
            </div>
          </div>

          {/* Right: Election State & Compact Mode Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Election State Badge */}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '4px',
                background: isVoting ? '#DCFCE7' : isPublished ? '#FEE2E2' : '#F1F5F9',
                color: isVoting ? '#15803D' : isPublished ? '#B91C1C' : '#475569',
                border: `1px solid ${isVoting ? '#86EFAC' : isPublished ? '#FCA5A5' : '#CBD5E1'}`
              }}
            >
              {isVoting ? '🟢 VOTING' : isPublished ? '🔴 CLOSED' : '⚪ STANDBY'}
            </span>

            {/* Compact Mode Switcher Button */}
            <button
              type="button"
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '6px',
                cursor: 'pointer',
                background: isTestMode ? '#FEF3C7' : '#EFF6FF',
                color: isTestMode ? '#92400E' : '#1D4ED8',
                border: `1px solid ${isTestMode ? '#F59E0B' : '#93C5FD'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease'
              }}
              onClick={async () => {
                const next = !isTestMode;
                if (setIsTestMode) setIsTestMode(next);
                triggerTempMessage('MODE SWITCHED', next ? 'TEST MODE ON' : 'LIVE VOTING ON', 2500);
                try {
                  const tallies = [testTallies.A || 0, testTallies.B || 0, testTallies.C || 0, testTallies.D || 0];
                  await setHardwareTestMode(next, {
                    tallies,
                    state: machineMode,
                    candidateCount: 4
                  });
                } catch (e) {
                  console.warn('[SET TEST MODE ERR]', e);
                }
              }}
            >
              <span>{isTestMode ? '🧪 Test Mode: ON' : '🗳️ Live Mode: ON'}</span>
              <span style={{ fontSize: '9px', opacity: 0.75 }}>(Click to switch)</span>
            </button>
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
              {isTestMode
                ? '🧪 Test Mode Voting Buttons (Pins D3, D4, D5, D6)'
                : '🔒 Candidate Voting Buttons (Hardware Only)'}
            </label>
            {isPublished && (
              <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700 }}>
                Displaying on LCD: {activeLcdView}
              </span>
            )}
          </div>

          {/* Mode explanation notification */}
          <div
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              background: isTestMode ? '#FFFBEB' : '#F1F5F9',
              border: `1px solid ${isTestMode ? '#FDE68A' : '#E2E8F0'}`,
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              color: isTestMode ? '#B45309' : '#475569',
              fontWeight: 600
            }}
          >
            <span>{isTestMode ? '🧪' : '🔒'}</span>
            <span>
              {isTestMode
                ? 'Test Mode: Web buttons are enabled for diagnostics. Simulated votes are NOT recorded in the database.'
                : 'Live Mode: Web voting buttons are disabled. Official votes are only taken from physical Arduino buttons (Pins D3–D6).'}
            </span>
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
                  const isButtonDisabled = !isTestMode || isDisabled || loadingSlot === slot || isPublished || isStandby;

                  return (
                    <button
                      key={slot}
                      className="btn-outline"
                      style={{
                        padding: '12px 8px',
                        fontWeight: 800,
                        fontSize: '14px',
                        cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                        borderColor: !isTestMode
                          ? '#E2E8F0'
                          : isDisabled
                          ? '#CBD5E1'
                          : isPublished
                          ? '#FCA5A5'
                          : '#F59E0B',
                        background: !isTestMode
                          ? '#F8FAFC'
                          : isPublished
                          ? '#FEF2F2'
                          : '#FFFDF5',
                        opacity: isButtonDisabled ? 0.55 : 1,
                        transition: 'all 0.1s ease'
                      }}
                      disabled={isButtonDisabled}
                      title={
                        !isTestMode
                          ? 'Voting buttons are disabled in Live Voting Mode. Cast votes using physical Arduino hardware buttons (Pins D3–D6).'
                          : isStandby
                          ? 'Voting has not started'
                          : isPublished
                          ? 'Voting is closed'
                          : isDisabled
                          ? 'Slot disabled'
                          : `Click to test simulated vote for Candidate ${slot}`
                      }
                      onClick={() => handleSimulateVote(slot)}
                    >
                      {loadingSlot === slot
                        ? '...'
                        : `Btn ${slot} (D${idx + 3})`}
                      <span
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: !isTestMode
                            ? '#64748B'
                            : isPublished
                            ? '#DC2626'
                            : '#B45309',
                          fontWeight: 600,
                          marginTop: '2px'
                        }}
                      >
                        {!isTestMode
                          ? '🔒 Hardware Only'
                          : isStandby
                          ? `Slot ${slot}`
                          : isPublished
                          ? 'Voting Closed'
                          : idx >= activeCount
                          ? 'Disabled'
                          : `🧪 ${testTallies[slot] || 0} test votes`}
                      </span>
                    </button>
                  );
                })}
              </div>
        </div>

        {/* CONTROL PIN 7 HARDWARE ACTIONS */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>
              Control Pin 7 Hardware Actions
            </label>
            <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>
              ✓ Active in both Live and Test modes
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {
          isStandby &&     <button className="btn-outline" onClick={() => handleTriggerAction('START')}>
              Start Voting (1 Click)
            </button>
        }

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
                <button
                  className="btn-outline"
                  style={{ background: '#F8FAFC', borderColor: '#94A3B8', color: '#334155', fontWeight: 700 }}
                  onClick={() => handleTriggerAction('CYCLE_STATS')}
                >
                  📊 Results Screen
                </button>
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
                background: isHardwareConnected ? '#F0FDF4' : '#FEF2F2',
                borderColor: isHardwareConnected ? '#86EFAC' : '#FCA5A5',
                color: isHardwareConnected ? '#166534' : '#991B1B',
                fontWeight: 700,
                cursor: !isHardwareConnected ? 'not-allowed' : 'pointer'
              }}
              title={
                isHardwareConnected
                  ? "Push web election state and live database tallies to adjust physical Arduino machine"
                  : "Hardware is not connected. Please connect hardware to sync."
              }
              disabled={isSyncing || !isHardwareConnected}
              onClick={handleSync}
            >
              {isSyncing
                ? '🔄 Syncing to Hardware...'
                : isHardwareConnected
                ? '🔄 Sync Web State to Hardware'
                : '⚠️ Connect Hardware to Sync'}
            </button>
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
          {onNavigateToInstructions ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToInstructions();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563EB',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              📖 View Complete Hardware Instructions &amp; Guide &rarr;
            </button>
          ) : <div />}
          <button className="btn-primary" onClick={onClose}>
            Close Console
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
