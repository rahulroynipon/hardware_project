import React, { useState, useEffect } from 'react';
import { Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
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
  Title,
  Filler
);

export default function Dashboard({
  elections = [],
  counts = { total: 0, draft: 0, live: 0, published: 0 },
  onSelectElection,
  onNavigateToElections,
  onOpenCreateModal
}) {
  const [currentClock, setCurrentClock] = useState('');

  // Live clock
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const datePart = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      const timePart = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dayPart = now.toLocaleDateString('en-US', { weekday: 'short' });
      setCurrentClock(`${datePart}\n${timePart} (${dayPart})`);
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Find active live election
  const liveElection = elections.find(e => e.status === 'live');

  // Compute live donut chart data
  const candidates = liveElection?.candidates || [];
  const candidateNames = candidates.map(c => c.name);
  const candidateVotes = candidates.map(c => c.votes || 0);
  const totalLiveVotes = candidateVotes.reduce((sum, v) => sum + v, 0);

  const chartColors = ['#D32F2F', '#0F172A', '#64748B', '#E2E8F0'];

  const donutData = {
    labels: candidateNames,
    datasets: [
      {
        data: totalLiveVotes > 0 ? candidateVotes : [1],
        backgroundColor: totalLiveVotes > 0 ? chartColors.slice(0, candidates.length) : ['#E2E8F0'],
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 4,
        cutout: '72%'
      }
    ]
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: totalLiveVotes > 0,
        callbacks: {
          label: (context) => {
            const val = context.raw || 0;
            const pct = totalLiveVotes > 0 ? ((val / totalLiveVotes) * 100).toFixed(1) : '0';
            return ` ${context.label}: ${val} votes (${pct}%)`;
          }
        }
      }
    }
  };

  // Line Trend Chart Data
  const trendLabels = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
  const trendDatasets = candidates.map((cand, idx) => {
    const finalVotes = cand.votes || 0;
    // create smooth progressive mock time series culminating at finalVotes
    const points = [
      Math.floor(finalVotes * 0.1),
      Math.floor(finalVotes * 0.25),
      Math.floor(finalVotes * 0.45),
      Math.floor(finalVotes * 0.65),
      Math.floor(finalVotes * 0.85),
      finalVotes
    ];
    return {
      label: cand.name,
      data: points,
      borderColor: chartColors[idx % chartColors.length],
      backgroundColor: chartColors[idx % chartColors.length],
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 4,
      pointHoverRadius: 6
    };
  });

  const lineData = {
    labels: trendLabels,
    datasets: trendDatasets.length > 0 ? trendDatasets : [
      {
        label: 'Votes',
        data: [0, 0, 0, 0, 0, 0],
        borderColor: '#94A3B8',
        tension: 0.3
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 10, font: { size: 11 } }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: '#F1F5F9' }, beginAtZero: true }
    }
  };

  return (
    <div className="page-container">
      {/* Page Header Row */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h1>Digital Election System</h1>
          <p>Manage elections and monitor voting activity in real time.</p>
        </div>
        <div className="clock-display" style={{ whiteSpace: 'pre-line' }}>
          <strong>{currentClock.split('\n')[0]}</strong>
          <span>{currentClock.split('\n')[1]}</span>
        </div>
      </div>

      {/* 4 KPI Cards Grid (Screen 1) */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={onNavigateToElections} style={{ cursor: 'pointer' }}>
          <div className="kpi-icon-wrapper kpi-icon-total">📑</div>
          <div className="kpi-content">
            <span className="kpi-label">Total Elections</span>
            <span className="kpi-number">{counts.total || elections.length}</span>
            <span className="kpi-subtext">All elections</span>
          </div>
        </div>

        <div className="kpi-card" onClick={onNavigateToElections} style={{ cursor: 'pointer' }}>
          <div className="kpi-icon-wrapper kpi-icon-draft">📝</div>
          <div className="kpi-content">
            <span className="kpi-label">Draft Elections</span>
            <span className="kpi-number">{counts.draft}</span>
            <span className="kpi-subtext">Not started</span>
          </div>
        </div>

        <div className="kpi-card" onClick={onNavigateToElections} style={{ cursor: 'pointer' }}>
          <div className="kpi-icon-wrapper kpi-icon-live">🗳️</div>
          <div className="kpi-content">
            <span className="kpi-label">Live Election</span>
            <span className="kpi-number">{counts.live}</span>
            <span className="kpi-subtext">Currently live</span>
          </div>
        </div>

        <div className="kpi-card" onClick={onNavigateToElections} style={{ cursor: 'pointer' }}>
          <div className="kpi-icon-wrapper kpi-icon-published">🏁</div>
          <div className="kpi-content">
            <span className="kpi-label">Published Elections</span>
            <span className="kpi-number">{counts.published}</span>
            <span className="kpi-subtext">Completed</span>
          </div>
        </div>
      </div>

      {/* Live Election Banner (Screen 1) */}
      {liveElection ? (
        <div className="live-election-banner">
          <div className="live-banner-top">
            <span className="live-badge">
              <span className="live-pulse"></span>
              LIVE Live Election
            </span>
            <button
              className="btn-primary"
              onClick={() => onSelectElection(liveElection.id)}
            >
              View Details &rarr;
            </button>
          </div>

          <div className="live-content-row">
            <img
              src={liveElection.banner_image || liveElection.image || "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=400&q=80"}
              alt={liveElection.title}
              className="live-thumbnail"
            />
            <div className="live-info-col">
              <h2>{liveElection.title}</h2>
              <div className="live-meta-row">
                <span className="live-meta-item">🏛️ {liveElection.organization || 'Campus Election'}</span>
                <span className="live-meta-item">
                  📅 {liveElection.start_date || liveElection.startDate || 'Active'} {liveElection.start_time || liveElection.startTime || ''}
                </span>
              </div>
            </div>
            <div className="countdown-box">
              <div className="countdown-label">Time Remaining</div>
              <div className="countdown-timer">{liveElection.time_remaining || liveElection.timeRemaining || '2h 15m 32s'}</div>
            </div>
          </div>

          <div className="live-stats-row">
            <div className="live-stat-item">
              <div className="live-stat-icon">🕒</div>
              <div className="live-stat-text">
                <span>Total Votes</span>
                <strong>{totalLiveVotes.toLocaleString()}</strong>
              </div>
            </div>

            <div className="live-stat-item">
              <div className="live-stat-icon">📈</div>
              <div className="live-stat-text">
                <span>Voted Students</span>
                <strong>
                  {liveElection.total_voters || liveElection.totalVoters
                    ? Math.round((totalLiveVotes / (liveElection.total_voters || liveElection.totalVoters)) * 100)
                    : 78}%
                </strong>
              </div>
            </div>

            <div className="live-stat-item">
              <div className="live-stat-icon">👥</div>
              <div className="live-stat-text">
                <span>Eligible Voters</span>
                <strong>{(liveElection.total_voters || liveElection.totalVoters || 1600).toLocaleString()}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="live-election-banner" style={{ textAlign: 'center', padding: '36px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🗳️</div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>No Active Live Election</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            There is currently no live polling session. Press the physical Start button on the Arduino console or launch an election.
          </p>
          <button className="btn-primary" onClick={onOpenCreateModal}>
            + Create & Start Election
          </button>
        </div>
      )}

      {/* Live Charts (Screen 1) */}
      <div className="charts-grid">
        {/* Left: Vote Distribution (Donut Chart) */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3>Vote Distribution (Live)</h3>
          </div>
          <div className="chart-donut-wrapper">
            <div className="donut-canvas-container">
              <Doughnut data={donutData} options={donutOptions} />
              <div className="donut-center-text">
                <strong>{totalLiveVotes.toLocaleString()}</strong>
                <span>Total Votes</span>
              </div>
            </div>

            <div className="donut-legend">
              {candidates.length > 0 ? (
                candidates.map((cand, idx) => {
                  const pct = totalLiveVotes > 0 ? ((cand.votes / totalLiveVotes) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={cand.id || idx} className="legend-item">
                      <div className="legend-left">
                        <span
                          className="legend-dot"
                          style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                        ></span>
                        <span>{cand.name}</span>
                      </div>
                      <span className="legend-pct">{pct}%</span>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Awaiting candidates and live votes...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Vote Trend (Line Chart) */}
        <div className="chart-card">
          <div className="chart-card-header">
            <h3>Vote Trend (Live)</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Last 2 Hours</span>
          </div>
          <div style={{ height: '220px', position: 'relative', width: '100%', minWidth: 0, overflow: 'hidden' }}>
            <Line data={lineData} options={lineOptions} />
          </div>
        </div>
      </div>

      {/* Recent Elections Table (Screen 1) */}
      <div className="table-card">
        <div className="table-header-row">
          <h3>Recent Elections</h3>
          <span className="view-all-link" onClick={onNavigateToElections}>
            View All &rarr;
          </span>
        </div>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Title</th>
              <th>Organization</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {elections.slice(0, 5).map((el, idx) => (
              <tr key={el.id}>
                <td>{idx + 1}</td>
                <td>
                  <strong>{el.title}</strong>
                </td>
                <td>{el.organization}</td>
                <td>{el.start_date || el.startDate}</td>
                <td>{el.start_time || el.startTime} - {el.end_time || el.endTime}</td>
                <td>
                  <span className={`status-badge ${el.status}`}>
                    {el.status === 'live' && <span className="pulse-dot"></span>}
                    {el.status.charAt(0).toUpperCase() + el.status.slice(1)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="table-action-btn"
                    onClick={() => onSelectElection(el.id)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
