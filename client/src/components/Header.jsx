import React from 'react';

export default function Header({ currentView, setCurrentView, isHardwareConnected, onOpenHardwareModal }) {
  return (
    <header className="top-header">
      <div className='page-container'>
           {/* Brand Section */}
      <div className="brand-section" onClick={() => setCurrentView('dashboard')} style={{ cursor: 'pointer' }}>
        <div className="brand-logo-icon">
          CU
        </div>
        <div className="brand-text">
          <h1>City University</h1>
          <span>Center of Excellence & Innovation</span>
        </div>
      </div>

      {/* Main Navigation: Exactly 2 Tabs (Dashboard & Elections) */}
      <nav className="nav-tabs-pill">
        <button
          className={`nav-tab-btn ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setCurrentView('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`nav-tab-btn ${currentView === 'elections' || currentView === 'details' ? 'active' : ''}`}
          onClick={() => setCurrentView('elections')}
        >
          Elections
        </button>
      </nav>

      {/* Header Utilities */}
      <div className="header-right">
        {/* Hardware Status Indicator */}
        <button
          className={`hardware-indicator ${isHardwareConnected ? 'connected' : 'disconnected'}`}
          onClick={onOpenHardwareModal}
          title="Click to manage Arduino hardware voting machine"
        >
          <span className="pulse-dot"></span>
          <span>{isHardwareConnected ? 'Arduino Live' : 'Hardware Ready'}</span>
        </button>
      </div>
      </div>
   
    </header>
  );
}
