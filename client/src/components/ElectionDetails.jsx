import React, { useState } from 'react';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Filler
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Filler
);

export default function ElectionDetails({
  election,
  onBack,
  onStartLive,
  onPublish,
  onDelete
}) {
  const [activeSubTab, setActiveSubTab] = useState('Overview');
  const [actionLoading, setActionLoading] = useState(false);

  if (!election) return null;

  const candidates = election.candidates || [];
  const totalVotes = candidates.reduce((sum, c) => sum + (c.votes || 0), 0);
  const totalVoters = election.total_voters || election.totalVoters || 1600;
  const turnoutPct = ((totalVotes / totalVoters) * 100).toFixed(1);
  const chartColors = ['#D32F2F', '#0F172A', '#2563EB', '#16A34A'];

  // Sorted candidates by votes
  const sortedCandidates = [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  const leader = sortedCandidates[0] || null;
  const runnerUp = sortedCandidates[1] || null;
  const marginVotes = leader && runnerUp ? (leader.votes || 0) - (runnerUp.votes || 0) : (leader ? leader.votes : 0);
  const marginPct = totalVotes > 0 ? ((marginVotes / totalVotes) * 100).toFixed(1) : '0.0';

  // 1. Donut Chart (Distribution)
  const donutData = {
    labels: candidates.map(c => c.name),
    datasets: [
      {
        data: totalVotes > 0 ? candidates.map(c => c.votes || 0) : [1],
        backgroundColor: totalVotes > 0 ? chartColors.slice(0, candidates.length) : ['#E2E8F0'],
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 6,
        cutout: '70%'
      }
    ]
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    }
  };

  // 2. Horizontal Bar Chart (Head-to-Head Comparison)
  const barData = {
    labels: candidates.map(c => `${c.name} (${c.slot})`),
    datasets: [
      {
        label: 'Votes Cast',
        data: candidates.map(c => c.votes || 0),
        backgroundColor: chartColors.slice(0, candidates.length),
        borderRadius: 6,
        barThickness: 26
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw} votes (${totalVotes > 0 ? ((ctx.raw / totalVotes) * 100).toFixed(1) : 0}%)`
        }
      }
    },
    scales: {
      x: { beginAtZero: true, grid: { color: '#F1F5F9' } },
      y: { grid: { display: false } }
    }
  };

  // 3. Cumulative Progression Trend
  const trendLabels = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
  const trendDatasets = candidates.map((cand, idx) => {
    const finalVotes = cand.votes || 0;
    const points = [
      Math.floor(finalVotes * 0.1),
      Math.floor(finalVotes * 0.28),
      Math.floor(finalVotes * 0.48),
      Math.floor(finalVotes * 0.68),
      Math.floor(finalVotes * 0.88),
      finalVotes
    ];
    return {
      label: `${cand.name} (${cand.slot})`,
      data: points,
      borderColor: chartColors[idx % chartColors.length],
      backgroundColor: 'transparent',
      tension: 0.35,
      borderWidth: 2.5,
      pointRadius: 3,
      pointHoverRadius: 6
    };
  });

  const lineData = {
    labels: trendLabels,
    datasets: trendDatasets
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: '#F1F5F9' } }
    }
  };

  // 4. Hourly Activity Bar Chart
  const hourlyData = {
    labels: ['10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'],
    datasets: [
      {
        label: 'Ballots Cast per Hour',
        data: [
          Math.floor(totalVotes * 0.12),
          Math.floor(totalVotes * 0.18),
          Math.floor(totalVotes * 0.25),
          Math.floor(totalVotes * 0.15),
          Math.floor(totalVotes * 0.14),
          Math.floor(totalVotes * 0.10),
          Math.floor(totalVotes * 0.06)
        ],
        backgroundColor: '#4F46E5',
        borderRadius: 4,
        barThickness: 22
      }
    ]
  };

  const hourlyOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: '#F1F5F9' } }
    }
  };

  async function handlePublishClick() {
    if (!confirm('End this election and publish final results? This will lock the voting session.')) return;
    setActionLoading(true);
    try {
      await onPublish(election.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStartLiveClick() {
    setActionLoading(true);
    try {
      await onStartLive(election.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="page-container">
      {/* Back button */}
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        &larr; Back to Elections
      </button>

      {/* Header Row */}
      <div className="election-detail-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800 }}>{election.title}</h1>
            <span className={`status-badge ${election.status}`}>
              {election.status === 'live' && <span className="pulse-dot"></span>}
              {election.status.charAt(0).toUpperCase() + election.status.slice(1)}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span>🕒 Start: {election.start_date || election.startDate || 'Active'} {election.start_time || election.startTime || ''}</span>
            <span>⏰ Deadline: {election.end_date || election.endDate || 'TBD'} {election.end_time || election.endTime || ''}</span>
            {election.time_remaining && (
              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>⏳ Timer: {election.time_remaining}</span>
            )}
          </div>
        </div>

        {/* Action Button: End Election (if live) or Start Live (if draft) */}
        <div>
          {election.status === 'live' && (
            <button
              className="btn-danger-outline"
              onClick={handlePublishClick}
              disabled={actionLoading}
            >
              {actionLoading ? 'Closing...' : 'End Election & Publish'}
            </button>
          )}

          {election.status === 'draft' && (
            <button
              className="btn-primary"
              onClick={handleStartLiveClick}
              disabled={actionLoading}
            >
              {actionLoading ? 'Starting...' : 'Start Live Polling'}
            </button>
          )}

          {election.status === 'published' && (
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-published-text)', background: 'var(--status-published-bg)', padding: '6px 14px', borderRadius: 'var(--radius-pill)' }}>
              🏆 Winner: {election.winner || 'Completed'}
            </span>
          )}
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="election-subtabs">
        {['Overview', `Candidates (${candidates.length})`, 'Live Results', 'Settings'].map((tab) => {
          const tabKey = tab.startsWith('Candidates') ? 'Candidates' : tab;
          const isActive = activeSubTab === tabKey || activeSubTab === tab;
          return (
            <button
              key={tab}
              className={`subtab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveSubTab(tabKey)}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* -------------------- TAB 1: OVERVIEW -------------------- */}
      {activeSubTab === 'Overview' && (
        <div className="details-2col-layout">
          {/* Left Column: Details & Quick Candidates */}
          <div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px', background: '#FFFFFF', marginBottom: '20px' }}>
              {election.banner_image && (
                <img
                  src={election.banner_image}
                  alt={election.title}
                  style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: '16px', border: '1px solid #E2E8F0' }}
                />
              )}
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Election Overview</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Election Title</span>
                  <strong>{election.title}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Status</span>
                  <span className={`status-badge ${election.status}`} style={{ marginTop: '2px' }}>
                    {election.status === 'live' && <span className="pulse-dot"></span>}
                    {election.status}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Start Time (Open)</span>
                  <span>{election.start_date || election.startDate} {election.start_time || election.startTime}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>End Time (Deadline)</span>
                  <span>{election.end_date || election.endDate} {election.end_time || election.endTime}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Voting Machine</span>
                  <strong>Arduino Hardware (Buttons A–D)</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Remaining Timer</span>
                  <strong style={{ color: 'var(--primary)' }}>{election.time_remaining || 'Active'}</strong>
                </div>
              </div>

              {election.description && (
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Description</span>
                  <p style={{ fontSize: '13px', color: 'var(--text-main)', marginTop: '4px', lineHeight: 1.5 }}>
                    {election.description}
                  </p>
                </div>
              )}
            </div>

            {/* Quick Candidates List */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px', background: '#FFFFFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                  Candidates ({candidates.length})
                </h3>
                <button
                  onClick={() => setActiveSubTab('Candidates')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                >
                  View All &rarr;
                </button>
              </div>

              {candidates.map((cand, idx) => {
                const pct = totalVotes > 0 ? ((cand.votes / totalVotes) * 100).toFixed(1) : '0.0';
                return (
                  <div key={cand.id || idx} className="candidate-tally-card">
                    <img
                      src={cand.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80'}
                      alt={cand.name}
                      className="candidate-tally-avatar"
                    />
                    <div className="candidate-tally-info">
                      <strong>{cand.name}</strong>
                      <span>Slot {cand.slot} &bull; Arduino Pin {3 + idx}</span>
                      <p style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '2px' }}>{cand.bio}</p>
                    </div>
                    <div className="candidate-tally-score">
                      <strong>{cand.votes || 0} votes</strong>
                      <span>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Donut & Trend Charts */}
          <div>
            <div className="chart-card" style={{ marginBottom: '20px' }}>
              <div className="chart-card-header">
                <h3>Live Vote Distribution</h3>
              </div>
              <div className="chart-donut-wrapper">
                <div className="donut-canvas-container">
                  <Doughnut data={donutData} options={donutOptions} />
                  <div className="donut-center-text">
                    <strong>{totalVotes.toLocaleString()}</strong>
                    <span>Total Votes</span>
                  </div>
                </div>

                <div className="donut-legend">
                  {candidates.map((cand, idx) => {
                    const pct = totalVotes > 0 ? ((cand.votes / totalVotes) * 100).toFixed(1) : '0.0';
                    return (
                      <div key={cand.id || idx} className="legend-item">
                        <div className="legend-left">
                          <span className="legend-dot" style={{ backgroundColor: chartColors[idx % chartColors.length] }}></span>
                          <span>{cand.name}</span>
                        </div>
                        <span className="legend-pct">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-card-header">
                <h3>Vote Progression Trend</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Real-time</span>
              </div>
              <div style={{ height: '240px' }}>
                <Line data={lineData} options={lineOptions} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- TAB 2: CANDIDATES -------------------- */}
      {activeSubTab === 'Candidates' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {candidates.map((cand, idx) => {
              const pct = totalVotes > 0 ? ((cand.votes / totalVotes) * 100).toFixed(1) : '0.0';
              return (
                <div
                  key={cand.id || idx}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <img
                      src={cand.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}
                      alt={cand.name}
                      style={{ width: '84px', height: '84px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #E2E8F0' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 800,
                        border: '2px solid #FFFFFF'
                      }}
                    >
                      {cand.slot}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
                    {cand.name}
                  </h3>

                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Hardware Slot <strong>{cand.slot}</strong> &bull; Arduino Pin <strong>{3 + idx}</strong>
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.5, marginBottom: '20px', flex: 1 }}>
                    {cand.bio || 'Candidate running for student leadership position.'}
                  </p>

                  <div style={{ width: '100%', background: '#F8FAFC', borderRadius: 'var(--radius-sm)', padding: '12px', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                      <span>Votes Received</span>
                      <strong style={{ color: 'var(--primary)' }}>{cand.votes || 0} ({pct}%)</strong>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: chartColors[idx % chartColors.length],
                          transition: 'width 0.3s ease'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -------------------- TAB 3: LIVE RESULTS & ADVANCED ANALYTICS -------------------- */}
      {activeSubTab === 'Live Results' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top 4 KPI Analytics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {/* Total Ballots */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Ballots Cast</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16A34A', display: 'inline-block' }}></span>
              </div>
              <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px', marginBottom: '2px' }}>
                {totalVotes.toLocaleString()}
              </h2>
              <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>● Live Telemetry Stream</span>
            </div>

            {/* Projected Leader */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Current Leader</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                {leader && (
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                    {leader.slot}
                  </span>
                )}
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {leader ? leader.name : 'No Votes Yet'}
                </h3>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>
                {leader ? `${leader.votes || 0} votes (${totalVotes > 0 ? ((leader.votes / totalVotes) * 100).toFixed(1) : 0}%)` : '-'}
              </span>
            </div>

            {/* Margin of Victory */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Victory Lead Margin</span>
              <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#2563EB', marginTop: '4px', marginBottom: '2px' }}>
                +{marginVotes} <span style={{ fontSize: '14px', fontWeight: 600 }}>votes</span>
              </h2>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {marginPct}% advantage over #2
              </span>
            </div>

            {/* Voter Turnout Rate */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Electorate Turnout</span>
              <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px', marginBottom: '2px' }}>
                {turnoutPct}%
              </h2>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {totalVotes} of {totalVoters} eligible voters
              </span>
            </div>
          </div>

          {/* Row 2: Head-to-Head Comparative Bar Chart + Live Donut */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
            {/* Horizontal Bar Chart */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Candidate Comparison (Head-to-Head)</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Vote counts and percentage share</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', background: '#EFF6FF', padding: '4px 10px', borderRadius: '4px' }}>
                  Live Bar Chart
                </span>
              </div>
              <div style={{ height: '240px' }}>
                <Bar data={barData} options={barOptions} />
              </div>
            </div>

            {/* Donut Chart */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Vote Share Distribution</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>100% Total</span>
              </div>
              <div style={{ height: '220px', position: 'relative' }}>
                <Doughnut data={donutData} options={donutOptions} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <strong style={{ fontSize: '22px', fontWeight: 800, display: 'block', color: 'var(--text-main)' }}>
                    {totalVotes}
                  </strong>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Ballots
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Cumulative Time Series Trend + Hourly Activity Velocity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            {/* Cumulative Line Trend */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Cumulative Vote Accumulation</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Candidate growth over time intervals</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: '#F1F5F9', padding: '4px 8px', borderRadius: '4px' }}>
                  Time Series
                </span>
              </div>
              <div style={{ height: '230px' }}>
                <Line data={lineData} options={lineOptions} />
              </div>
            </div>

            {/* Hourly Activity Bar Chart */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Voting Activity Velocity</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ballots cast by voting window</span>
                </div>
                <span style={{ fontSize: '11px', color: '#4F46E5', background: '#EEF2FF', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Hourly
                </span>
              </div>
              <div style={{ height: '230px' }}>
                <Bar data={hourlyData} options={hourlyOptions} />
              </div>
            </div>
          </div>

          {/* Row 4: Detailed Audit Leaderboard + Live Hardware Ballot Feed */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
            {/* Full Ranked Leaderboard */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Ranked Leaderboard</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sorted by vote tally</span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #E2E8F0', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <th style={{ padding: '8px 10px' }}>Rank</th>
                    <th style={{ padding: '8px 10px' }}>Slot</th>
                    <th style={{ padding: '8px 10px' }}>Candidate</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Votes</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Share</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCandidates.map((cand, idx) => {
                    const pct = totalVotes > 0 ? ((cand.votes / totalVotes) * 100).toFixed(1) : '0.0';
                    const isWinning = idx === 0 && totalVotes > 0;
                    return (
                      <tr key={cand.id || idx} style={{ borderBottom: '1px solid #F1F5F9', background: isWinning ? '#F0FDF4' : 'transparent' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 700, color: isWinning ? '#16A34A' : 'var(--text-muted)' }}>
                          #{idx + 1}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: chartColors[cand.order ? cand.order - 1 : idx], color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                            {cand.slot}
                          </span>
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>{cand.name}</strong>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Arduino Pin {3 + idx}</span>
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 800, fontSize: '14px' }}>
                          {cand.votes || 0}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                          {pct}%
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          {isWinning ? (
                            <span style={{ fontSize: '11px', fontWeight: 700, background: '#DCFCE7', color: '#16A34A', padding: '3px 8px', borderRadius: '4px' }}>
                              🏆 Leading
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Runner-up
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Hardware Telemetry Feed */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '22px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Hardware Telemetry Feed</h3>
                <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700 }}>● Live 9600 Baud</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {election.recentVotes && election.recentVotes.length > 0 ? (
                  election.recentVotes.slice(0, 6).map((vote, i) => (
                    <div
                      key={vote.id || i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#F8FAFC',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--primary)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>
                          {vote.slot}
                        </span>
                        <div>
                          <strong>{vote.candidate_name || `Slot ${vote.slot}`}</strong>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)' }}>
                            Arduino Push Button Registered
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                        {new Date(vote.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))
                ) : (
                  candidates.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#F8FAFC',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: chartColors[i % chartColors.length], color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>
                          {c.slot}
                        </span>
                        <div>
                          <strong>{c.name}</strong>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)' }}>
                            Pin {3 + i} Hardware Listener Active
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}>
                        {c.votes || 0} votes
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- TAB 4: SETTINGS -------------------- */}
      {activeSubTab === 'Settings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Election Controls & Info */}
          <div>
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Election Lifecycle</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#F8FAFC', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <strong style={{ fontSize: '14px', display: 'block' }}>Current Status</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {election.status === 'live' ? 'Voting is actively recording from hardware machine.' : 'Election is closed or in draft mode.'}
                    </span>
                  </div>
                  <span className={`status-badge ${election.status}`}>
                    {election.status}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  {election.status === 'live' && (
                    <button
                      className="btn-danger-outline"
                      onClick={handlePublishClick}
                      disabled={actionLoading}
                      style={{ flex: 1, padding: '10px' }}
                    >
                      {actionLoading ? 'Closing...' : 'End Election & Publish Results'}
                    </button>
                  )}

                  {election.status === 'draft' && (
                    <button
                      className="btn-primary"
                      onClick={handleStartLiveClick}
                      disabled={actionLoading}
                      style={{ flex: 1, padding: '10px' }}
                    >
                      {actionLoading ? 'Starting...' : 'Start Live Polling Now'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Hardware Pin Mapping Info */}
            <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>Arduino Pin Configuration</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '4px' }}>
                  <span>Candidate A Push Button</span>
                  <strong>Pin 3 (Internal Pullup)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '4px' }}>
                  <span>Candidate B Push Button</span>
                  <strong>Pin 4 (Internal Pullup)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '4px' }}>
                  <span>Candidate C Push Button</span>
                  <strong>Pin 5 {candidates.length < 3 ? '(Disabled)' : '(Active)'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '4px' }}>
                  <span>Candidate D Push Button</span>
                  <strong>Pin 6 {candidates.length < 4 ? '(Disabled)' : '(Active)'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#EFF6FF', borderRadius: '4px', color: 'var(--primary)' }}>
                  <span>Master Control Button</span>
                  <strong>Pin 7 (Start / Reset / Power)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F0FDF4', borderRadius: '4px', color: '#16A34A' }}>
                  <span>Live Status Green LED</span>
                  <strong>Pin 12</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#FEF2F2', borderRadius: '4px', color: '#DC2626' }}>
                  <span>Published Status Red LED</span>
                  <strong>Pin 13</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div>
            <div style={{ background: '#FFFFFF', border: '1px solid #FECACA', borderRadius: 'var(--radius-md)', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626', marginBottom: '8px' }}>
                Danger Zone
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.4 }}>
                Deleting this election will remove all ballot records, candidate tallies, and audit logs permanently from PostgreSQL. This action cannot be undone.
              </p>
              <button
                type="button"
                onClick={() => onDelete && onDelete(election.id)}
                style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                🗑️ Delete Election Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
