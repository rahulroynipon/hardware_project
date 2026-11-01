import React from 'react';

export default function InstructionsGuide({
  isHardwareConnected,
  onOpenHardwareModal,
  onNavigateToCreate,
  onNavigateToDashboard
}) {
  return (
    <div className="page-container" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '24px' }}>📖</span>
            <h1 style={{ margin: 0 }}>System Instructions & Hardware Manual</h1>
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
            Complete step-by-step operational guide for the Arduino Uno digital voting machine, physical push-button controls, dual-display sync, and live election management.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn-outline"
            style={{ fontWeight: 700, borderColor: '#CBD5E1', background: '#FFFFFF' }}
            onClick={onNavigateToDashboard}
          >
            &larr; Back to Dashboard
          </button>
          <button
            className="btn-primary"
            style={{ background: '#0F172A', borderColor: '#0F172A' }}
            onClick={onOpenHardwareModal}
          >
            🔌 Open Hardware Console
          </button>
          <button className="btn-primary" onClick={onNavigateToCreate}>
            + Create Election
          </button>
        </div>
      </div>

      {/* Real-time Hardware Status Card */}
      <div
        style={{
          marginBottom: '28px',
          padding: '16px 20px',
          borderRadius: '12px',
          background: isHardwareConnected ? '#F0FDF4' : '#FEF2F2',
          border: `2px solid ${isHardwareConnected ? '#86EFAC' : '#FCA5A5'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '32px', lineHeight: 1 }}>
            {isHardwareConnected ? '🟢' : '⚠️'}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '15px', color: isHardwareConnected ? '#065F46' : '#991B1B' }}>
                {isHardwareConnected
                  ? 'Voting Machine Detected & Connected'
                  : 'Voting Machine Not Connected (Please Plug in USB)'}
              </strong>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: isHardwareConnected ? '#DCFCE7' : '#FEE2E2',
                  color: isHardwareConnected ? '#15803D' : '#991B1B'
                }}
              >
                {isHardwareConnected ? 'USB Active (9600 Baud)' : 'Action Required'}
              </span>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: isHardwareConnected ? '#166534' : '#B91C1C' }}>
              {isHardwareConnected
                ? 'Arduino Uno hardware serial bridge is active. Physical button votes and state synchronization are ready.'
                : 'Step 1 required: Connect the physical Arduino Uno voting machine via USB to begin election sessions.'}
            </p>
          </div>
        </div>

        <button
          className="btn-outline"
          style={{
            fontSize: '12px',
            fontWeight: 700,
            background: '#FFFFFF',
            borderColor: isHardwareConnected ? '#86EFAC' : '#FCA5A5',
            color: isHardwareConnected ? '#065F46' : '#991B1B'
          }}
          onClick={onOpenHardwareModal}
        >
          {isHardwareConnected ? 'Manage Hardware' : 'Check Hardware Status'}
        </button>
      </div>

      {/* 5-Step Operational Workflow */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '16px' }}>
          🚀 5-Step Election Operation Guide
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
          {/* STEP 1: Connect Machine */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px'
                }}
              >
                1
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Connect Voting Machine</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              <strong>First step:</strong> Plug the Arduino Uno board into the computer's USB port.
            </p>
            <ul style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
              <li>The machine boots with a smooth scrolling welcome message on the 1602 LCD.</li>
              <li>Display settles on Standby: <code>TO START VOTING / PRESS TO START</code>.</li>
              <li>The web header automatically turns green with <code>Arduino Live</code> status.</li>
            </ul>
          </div>

          {/* STEP 2: Create Election */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px'
                }}
              >
                2
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Create &amp; Configure Election</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Click <strong>"+ Create Election"</strong> to set up ballot details and candidates.
            </p>
            <ul style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
              <li>Add between <strong>2 and 4 candidates</strong> (mapped directly to Buttons A–D).</li>
              <li><strong>Candidate A</strong> &rarr; Pin 3 &bull; <strong>Candidate B</strong> &rarr; Pin 4</li>
              <li><strong>Candidate C</strong> &rarr; Pin 5 &bull; <strong>Candidate D</strong> &rarr; Pin 6</li>
              <li>Save as Draft or launch directly into Live mode.</li>
            </ul>
          </div>

          {/* STEP 3: Start Voting */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#16A34A',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px'
                }}
              >
                3
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Open Voting Session</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Voting can be started either from the physical machine or the web dashboard.
            </p>
            <ul style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
              <li><strong>Physical Start:</strong> Press <strong>Pin 7 (Control Button)</strong> once when in Standby.</li>
              <li><strong>Web Start:</strong> Click <em>"Start Voting"</em> on the election details page.</li>
              <li>Screen displays <code>VOTING STARTED / Cast your vote!</code> for 1.2s.</li>
              <li><strong>Green LED (Pin 13)</strong> lights up continuously to signal voting is open.</li>
            </ul>
          </div>

          {/* STEP 4: Cast Votes */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#9333EA',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px'
                }}
              >
                4
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Cast Ballots (Pins 3–6)</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              In Live Mode, official votes are accepted <strong>only from the physical machine</strong>.
            </p>
            <ul style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
              <li>Voters press Button A (Pin 3), B (Pin 4), C (Pin 5), or D (Pin 6).</li>
              <li>Green LED blinks to provide tactile/visual vote confirmation.</li>
              <li>LCD confirms with <code>Vote Recorded / Candidate [X]</code>.</li>
              <li>Tallies update instantly in PostgreSQL and broadcast to web live charts.</li>
            </ul>
          </div>

          {/* STEP 5: Publish Results */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#D97706',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px'
                }}
              >
                5
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Publish &amp; Close Results</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Close voting and display official winners permanently.
            </p>
            <ul style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
              <li>Press <strong>Pin 7 (Control Button)</strong> once during voting OR click <em>"Publish"</em> online.</li>
              <li>Green LED turns OFF; <strong>Red LED (Pin 12)</strong> turns ON.</li>
              <li>LCD shows <code>RESULT PUBLISHED / Voting is closed</code> then displays <strong>WINNER</strong>.</li>
              <li>Subsequent clicks on Pin 7 cycle through candidate totals and summary pages.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* HARDWARE REFERENCE TABLE */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '16px' }}>
          🎛️ Physical Hardware Buttons &amp; Pin Mapping Reference
        </h2>

        <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#334155' }}>Pin &amp; Component</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#334155' }}>Action / Trigger</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#334155' }}>Behavior &amp; Function</th>
                <th style={{ padding: '12px 16px', fontWeight: 800, color: '#334155' }}>LCD / LED Feedback</th>
              </tr>
            </thead>
            <tbody>
              {/* Pin 3 */}
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800 }}>Pin 3</span> Button A
                </td>
                <td style={{ padding: '12px 16px' }}>Press Down</td>
                <td style={{ padding: '12px 16px' }}>Casts ballot for <strong>Candidate A</strong></td>
                <td style={{ padding: '12px 16px', color: '#16A34A', fontWeight: 600 }}>Green LED blinks; "Vote Recorded / Candidate A"</td>
              </tr>
              {/* Pin 4 */}
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800 }}>Pin 4</span> Button B
                </td>
                <td style={{ padding: '12px 16px' }}>Press Down</td>
                <td style={{ padding: '12px 16px' }}>Casts ballot for <strong>Candidate B</strong></td>
                <td style={{ padding: '12px 16px', color: '#16A34A', fontWeight: 600 }}>Green LED blinks; "Vote Recorded / Candidate B"</td>
              </tr>
              {/* Pin 5 */}
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800 }}>Pin 5</span> Button C
                </td>
                <td style={{ padding: '12px 16px' }}>Press Down</td>
                <td style={{ padding: '12px 16px' }}>Casts ballot for <strong>Candidate C</strong></td>
                <td style={{ padding: '12px 16px', color: '#16A34A', fontWeight: 600 }}>Green LED blinks; "Vote Recorded / Candidate C"</td>
              </tr>
              {/* Pin 6 */}
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800 }}>Pin 6</span> Button D
                </td>
                <td style={{ padding: '12px 16px' }}>Press Alone (90ms debounce)</td>
                <td style={{ padding: '12px 16px' }}>Casts ballot for <strong>Candidate D</strong></td>
                <td style={{ padding: '12px 16px', color: '#16A34A', fontWeight: 600 }}>Green LED blinks; "Vote Recorded / Candidate D"</td>
              </tr>
              {/* Pin 7 - 1 Click */}
              <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#FEF3C7', color: '#B45309', fontWeight: 800 }}>Pin 7</span> Control Button
                </td>
                <td style={{ padding: '12px 16px' }}>Short Click (&lt; 3 seconds)</td>
                <td style={{ padding: '12px 16px' }}>
                  • <strong>Standby:</strong> Starts voting session<br />
                  • <strong>Voting:</strong> Publishes results &amp; closes voting<br />
                  • <strong>Published:</strong> Cycles through statistics pages
                </td>
                <td style={{ padding: '12px 16px' }}>
                  "VOTING STARTED" (Green LED ON)<br />
                  "RESULT PUBLISHED" (Red LED ON)
                </td>
              </tr>
              {/* Pin 7 - 3s Hold */}
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#FEF3C7', color: '#B45309', fontWeight: 800 }}>Pin 7</span> Control Button
                </td>
                <td style={{ padding: '12px 16px' }}>Hold 3 to 5 seconds &amp; Release</td>
                <td style={{ padding: '12px 16px' }}>
                  <strong>Reset Election:</strong> Clears all tallies back to 0 and returns machine to Standby mode.
                </td>
                <td style={{ padding: '12px 16px', color: '#DC2626', fontWeight: 600 }}>"VOTES RESET / Press to Start"; Both LEDs OFF</td>
              </tr>
              {/* Pin 7 - 5s Hold */}
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#FEF3C7', color: '#B45309', fontWeight: 800 }}>Pin 7</span> Control Button
                </td>
                <td style={{ padding: '12px 16px' }}>Continuous 5-second Hold</td>
                <td style={{ padding: '12px 16px' }}>
                  <strong>Power OFF / Sleep:</strong> Completely turns off display, backlight, and LEDs. (Hold 5s again to wake up).
                </td>
                <td style={{ padding: '12px 16px' }}>"POWERING OFF..."; LCD completely dark</td>
              </tr>
              {/* Combo Pin 6 & 7 - Mode Toggle */}
              <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FFFDF5' }}>
                <td style={{ padding: '12px 16px', fontWeight: 800, color: '#B45309' }}>
                  ⚡ Pin 6 + Pin 7 Combo
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                  Short Press Both (&lt; 2s)
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <strong>Mode Toggle (Test &harr; Live):</strong> Instantly switches between Hardware Test Mode and Live Voting Mode with automatic state sync!
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#D97706' }}>
                  "MODE SWITCHED / TEST MODE ON" (or LIVE VOTING ON) for 2.5s
                </td>
              </tr>
              {/* Combo Pin 6 & 7 - Sync */}
              <tr style={{ background: '#FFFDF5' }}>
                <td style={{ padding: '12px 16px', fontWeight: 800, color: '#B45309' }}>
                  ⚡ Pin 6 + Pin 7 Combo
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                  Hold Both for 2 to 3 Seconds
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <strong>Hardware State Sync:</strong> Synchronizes physical tallies with matching data (Test data in Test Mode, PostgreSQL live database in Live Mode).
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#2563EB' }}>
                  "HARDWARE SYNCING / PLEASE WAIT..." on both physical LCD &amp; web console for 2.5s
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* MODE COMPARISON: LIVE VS TEST */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
        {/* Live Voting Mode */}
        <div style={{ background: '#FFFFFF', border: '2px solid #86EFAC', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px' }}>🔒</span>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#15803D', margin: 0 }}>
              Live Voting Mode (Official Balloting)
            </h3>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
            Used during official university elections. Guarantees tamper-proof ballot casting.
          </p>
          <ul style={{ fontSize: '12px', color: '#14532D', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
            <li><strong>Votes accepted ONLY from physical Arduino buttons (Pins 3–6).</strong></li>
            <li>Web voting buttons are strictly disabled to prevent remote tampering.</li>
            <li>Every vote writes directly to the secure PostgreSQL database with audit timestamps.</li>
            <li>Sync pulls latest official tallies from the database.</li>
          </ul>
        </div>

        {/* Hardware Test Mode */}
        <div style={{ background: '#FFFFFF', border: '2px solid #FDE68A', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px' }}>🧪</span>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#B45309', margin: 0 }}>
              Hardware Test Mode (Pre-Flight Diagnostics)
            </h3>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
            Used by election officials to verify wiring, LCD, LEDs, and buttons before polling day.
          </p>
          <ul style={{ fontSize: '12px', color: '#78350F', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
            <li><strong>Official PostgreSQL database is 100% untouched and safe.</strong></li>
            <li>Web buttons in the Hardware Console are unlocked for simulated diagnostics.</li>
            <li>Physical push buttons on the Arduino can also be pressed to test responsiveness.</li>
            <li>Sync adjusts the physical machine to match the test console's simulated counts.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
