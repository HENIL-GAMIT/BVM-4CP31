import React from 'react';
import { clearSession, getSession } from '../auth';

export default function PortNavigationBanner({ activeMode, currentPort, onSwitchView }) {
  const session = getSession();

  function handleLogout() {
    clearSession();
    window.location.reload();
  }

  // Determine port URL or hash/query navigation
  const portConfig = [
    {
      id: 'emergency',
      port: '3001',
      label: 'Emergency Portal',
      icon: '🚨',
      desc: 'Citizen SOS & Live Tracking',
      color: '#ef4444'
    },
    {
      id: 'hospital-driver',
      port: '3002',
      label: 'Hospital & Driver',
      icon: '🚑',
      desc: 'Paramedic MDT & ER Triage',
      color: '#f59e0b'
    },
    {
      id: 'command',
      port: '3003',
      label: 'Command Center',
      icon: '🖥️',
      desc: 'Tactical Ops, Analytics & History',
      color: '#3b82f6'
    },
    {
      id: 'hub',
      port: '3000',
      label: 'Master Hub',
      icon: '🌐',
      desc: 'All Portals Overview',
      color: '#10b981'
    }
  ];

  function navigateTo(targetPort, targetId) {
    if (typeof window === 'undefined') return;
    const hostname = window.location.hostname || 'localhost';
    
    // If user is currently running on the multi-port server, navigate to the specific port!
    if (['3000', '3001', '3002', '3003'].includes(window.location.port)) {
      window.location.href = `http://${hostname}:${targetPort}`;
    } else {
      // In Expo dev mode or other ports, switch view in-place and update URL query
      if (onSwitchView) {
        onSwitchView(targetId);
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('port', targetPort);
        url.searchParams.set('ui', targetId);
        window.history.pushState({}, '', url.toString());
      } catch (e) {}
    }
  }

  return (
    <header className="port-nav-banner">
      <div className="port-nav-left">
        <div className="port-nav-brand" onClick={() => navigateTo('3000', 'hub')}>
          <div className="port-nav-pulse-mark">
            <span>+</span>
          </div>
          <div>
            <div className="port-nav-brand-title">
              <strong>SMART DISPATCH 108</strong>
              <span className="live-badge">REAL-WORLD OPS</span>
            </div>
            <p className="port-nav-brand-sub">National Emergency Ambulance & Green Corridor Network</p>
          </div>
        </div>

        <div className="active-port-indicator">
          <span className="port-tag-dot" />
          <span className="port-tag-label">PORT:</span>
          <strong className="port-tag-num">{currentPort || '3000'}</strong>
          <span className="port-tag-env">ONLINE</span>
        </div>
      </div>

      <nav className="port-nav-links" aria-label="Port navigation">
        {portConfig.map((item) => {
          const isCurrent = (currentPort === item.port) || (activeMode === item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`port-link-pill ${isCurrent ? 'active' : ''}`}
              onClick={() => navigateTo(item.port, item.id)}
              title={`${item.desc} (localhost:${item.port})`}
            >
              <span className="pill-icon">{item.icon}</span>
              <span className="pill-text">
                <span className="pill-title">{item.label}</span>
                <span className="pill-port">:{item.port}</span>
              </span>
              {isCurrent && <span className="pill-active-dot" />}
            </button>
          );
        })}
      </nav>

      <div className="port-nav-right">
        <a href="tel:108" className="hotline-btn" title="Call Emergency Helpline 108">
          <span className="hotline-btn-icon">📞</span>
          <div className="hotline-btn-text">
            <small>TOLL-FREE HELPLINE</small>
            <strong>108</strong>
          </div>
        </a>

        {session ? (
          <div className="session-user-badge">
            <span className="session-role-pill">
              <span className="online-indicator" />
              {session.role} {session.ambulanceId ? `#${session.ambulanceId}` : ''}
            </span>
            <button className="signout-btn" type="button" onClick={handleLogout} title="Sign Out">
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

