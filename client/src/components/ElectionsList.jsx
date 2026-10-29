import React, { useState } from 'react';

export default function ElectionsList({
  elections = [],
  counts = { total: 0, draft: 0, live: 0, published: 0 },
  onSelectElection,
  onOpenCreateModal
}) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter elections by tab and search
  const filtered = elections.filter((el) => {
    const matchesTab = activeFilter === 'all' ? true : el.status === activeFilter;
    const matchesSearch = searchQuery.trim() === ''
      ? true
      : el.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (el.organization && el.organization.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="page-container">
      {/* Page Title & Create Button */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h1>Elections</h1>
          <p>Create, manage and monitor all elections. Only one election can be live at a time.</p>
        </div>
        <button className="btn-primary" onClick={onOpenCreateModal}>
          + Create Election
        </button>
      </div>

      {/* Filter Tabs & Search Bar (Screen 2) */}
      <div className="elections-filter-bar">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All Elections ({counts.total || elections.length})
          </button>
          <button
            className={`filter-tab ${activeFilter === 'draft' ? 'active' : ''}`}
            onClick={() => setActiveFilter('draft')}
          >
            Draft ({counts.draft})
          </button>
          <button
            className={`filter-tab ${activeFilter === 'live' ? 'active' : ''}`}
            onClick={() => setActiveFilter('live')}
          >
            Live ({counts.live})
          </button>
          <button
            className={`filter-tab ${activeFilter === 'published' ? 'active' : ''}`}
            onClick={() => setActiveFilter('published')}
          >
            Published ({counts.published})
          </button>
        </div>

        <div className="search-and-controls">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search elections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select className="form-select" style={{ width: '130px', padding: '8px 12px' }}>
            <option>All Dates</option>
            <option>Today</option>
            <option>This Week</option>
            <option>This Month</option>
          </select>
        </div>
      </div>

      {/* Elections Table (Screen 2) */}
      <div className="table-card">
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
            {filtered.length > 0 ? (
              filtered.map((el, idx) => (
                <tr key={el.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <strong>{el.title}</strong>
                  </td>
                  <td>{el.organization || 'General'}</td>
                  <td>{el.start_date || el.startDate || 'Active'}</td>
                  <td>{el.start_time || el.startTime || '-'}</td>
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
                      {el.status === 'draft' ? 'Edit' : 'View'}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  No elections match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
