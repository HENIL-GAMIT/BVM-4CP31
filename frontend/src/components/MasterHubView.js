import React from 'react';

export default function MasterHubView({ onSwitchView }) {
  const portals = [
    {
      id: 'emergency',
      port: '3001',
      title: 'Citizen Emergency Portal',
      desc: 'One-touch SOS calling, automatic GPS location, and live ambulance tracking with real-time ETA.',
      icon: '🚨',
      btnColor: '#ef4444',
      url: 'http://localhost:3001'
    },
    {
      id: 'hospital-driver',
      port: '3002',
      title: 'Hospital & Ambulance Driver',
      desc: 'Ambulance driver navigation MDT with live GPS, mission steppers, and hospital ER trauma intake board.',
      icon: '🚑',
      btnColor: '#f59e0b',
      url: 'http://localhost:3002'
    },
    {
      id: 'command',
      port: '3003',
      title: 'Command Center & Analytics',
      desc: 'City-wide tactical fleet dispatch, emergency hospital network, and operational analytics.',
      icon: '🖥️',
      btnColor: '#3b82f6',
      url: 'http://localhost:3003'
    }
  ];

  function openUrl(port, id) {
    const hostname = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
    if (['3000', '3001', '3002', '3003'].includes(window.location.port)) {
      window.open(`http://${hostname}:${port}`, '_blank');
    } else if (onSwitchView) {
      onSwitchView(id);
    } else {
      window.open(`http://${hostname}:${port}`, '_blank');
    }
  }

  function launchAllSideBySide() {
    const hostname = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
    window.open(`http://${hostname}:3001`, '_blank');
    setTimeout(() => window.open(`http://${hostname}:3002`, '_blank'), 300);
    setTimeout(() => window.open(`http://${hostname}:3003`, '_blank'), 600);
  }

  return (
    <div className="simple-page-container">
      {/* Clean Header */}
      <header className="clean-app-header">
        <div className="header-brand-box">
          <div className="red-cross-mark">+</div>
          <div>
            <h1>Smart Dispatch 108 Portal Hub</h1>
            <p>Distributed Municipal Emergency Ambulance & Fleet Mesh</p>
          </div>
        </div>

        <button type="button" className="simple-primary-btn" onClick={launchAllSideBySide}>
          🚀 Launch All 3 Portals
        </button>
      </header>

      {/* 3 Portal Cards */}
      <div className="simple-hub-grid">
        {portals.map((p) => (
          <div key={p.id} className="simple-portal-card">
            <div className="portal-card-top">
              <span className="portal-large-icon">{p.icon}</span>
              <span className="port-badge">PORT {p.port}</span>
            </div>

            <h3>{p.title}</h3>
            <p className="portal-desc">{p.desc}</p>

            <button
              type="button"
              className="open-portal-btn"
              style={{ background: p.btnColor }}
              onClick={() => openUrl(p.port, p.id)}
            >
              Open on Port {p.port} ↗
            </button>

            <span className="portal-link-hint"><code>{p.url}</code></span>
          </div>
        ))}
      </div>

      {/* Real-World Flow Banner */}
      <div className="simple-card flow-summary-card">
        <h3>How It Works in a Real Emergency</h3>
        <div className="simple-flow-steps">
          <div className="flow-step-item">
            <div className="flow-step-num">1</div>
            <strong>Citizen SOS (:3001)</strong>
            <p>Caller requests ambulance with 1-click GPS detection.</p>
          </div>
          <div className="flow-step-arrow">→</div>
          <div className="flow-step-item">
            <div className="flow-step-num">2</div>
            <strong>Command Center (:3003)</strong>
            <p>Dispatcher auto-assigns nearest ambulance & clears traffic signals.</p>
          </div>
          <div className="flow-step-arrow">→</div>
          <div className="flow-step-item">
            <div className="flow-step-num">3</div>
            <strong>Driver & Hospital (:3002)</strong>
            <p>Paramedic navigates to scene and streams patient vitals to ER.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
