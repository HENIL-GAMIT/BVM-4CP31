import React, { useState } from 'react';
import { clearSession, getSession } from './auth';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import DriverView from './components/DriverView';
import Emergency from './components/Emergency';
import HistoryView from './components/HistoryView';
import HospitalView from './components/HospitalView';
import ReportsView from './components/ReportsView';
import './styles.css';

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

if (typeof window !== 'undefined' && !window.__smartDispatchApiConfigured) {
  const browserFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const requestUrl = typeof input === 'string' && input.startsWith('/api') ? `${apiBaseUrl}${input}` : input;
    return browserFetch(requestUrl, init);
  };
  window.__smartDispatchApiConfigured = true;
}

const modes = [
  { id: 'emergency', label: 'Emergency', icon: '🚨' },
  { id: 'driver', label: 'Driver Portal', icon: '🚑' },
  { id: 'hospital', label: 'Hospital', icon: '🏥' },
  { id: 'admin', label: 'Command Center', icon: '🖥️' },
  { id: 'history', label: 'Mission History', icon: '📜' },
  { id: 'reports', label: 'Analytics', icon: '📊' },
];

function initialMode(session) {
  if (!session) return 'emergency';
  return session.role === 'Admin'
    ? 'admin'
    : session.role === 'Driver'
    ? 'driver'
    : session.role === 'Hospital'
    ? 'hospital'
    : 'emergency';
}

export default function DesktopApp() {
  const [session, setSession] = useState(() => getSession());
  const [mode, setMode] = useState(() => initialMode(getSession()));

  function logout() {
    clearSession();
    setSession(null);
    setMode('emergency');
  }

  function renderView() {
    if (mode === 'admin') {
      return session?.role === 'Admin' ? (
        <AdminDashboard />
      ) : (
        <AdminLogin
          onAuth={() => {
            setSession(getSession());
            setMode('admin');
          }}
        />
      );
    }
    if (mode === 'driver') return <DriverView />;
    if (mode === 'hospital') return <HospitalView />;
    if (mode === 'history') return <HistoryView />;
    if (mode === 'reports') return <ReportsView />;
    return <Emergency />;
  }

  return (
    <main className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">+</div>
          <div>
            <div className="brand-title-row">
              <h1>Smart Dispatch</h1>
              <span className="brand-live-pill">LIVE SYSTEM</span>
            </div>
            <p>Next-Gen Emergency Response & Fleet Control</p>
          </div>
        </div>

        <div className="session-actions">
          <a href="tel:108" className="hotline-pill">
            <span className="hotline-icon">📞</span>
            <div className="hotline-text">
              <small>EMERGENCY HELPLINE</small>
              <strong>108</strong>
            </div>
          </a>

          {session ? (
            <div className="user-session-box">
              <span className="session-label">
                <span className="status-dot online" />
                {session.role} {session.ambulanceId ? `#${session.ambulanceId}` : ''}
              </span>
              <button className="ghost-btn logout-btn" type="button" onClick={logout}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="mode-toggle-bar" aria-label="Dispatch views">
        <div className="mode-toggle-inner">
          {modes.map((item) => (
            <button
              key={item.id}
              className={`mode-button ${mode === item.id ? 'active' : ''}`}
              type="button"
              onClick={() => setMode(item.id)}
            >
              <span className="mode-btn-icon">{item.icon}</span>
              <span className="mode-btn-label">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main View Container */}
      <section className="content-panel">{renderView()}</section>
    </main>
  );
}