import React, { useState } from 'react';
import CitizenEmergencyView from './components/CitizenEmergencyView';
import HospitalDriverPortal from './components/HospitalDriverPortal';
import CommandCenterPortal from './components/CommandCenterPortal';
import { clearSession, getSession, saveSession } from './auth';
import './styles.css';

const webLocation = typeof window !== 'undefined' ? window.location : undefined;
const expoWebApiUrl = webLocation?.port === '8081'
  ? `${webLocation.protocol}//${webLocation.hostname}:5000`
  : '';
const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL || expoWebApiUrl).replace(/\/$/, '');

if (typeof window !== 'undefined' && !window.__smartDispatchApiConfigured) {
  const browserFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const requestUrl = typeof input === 'string' && input.startsWith('/api') ? `${apiBaseUrl}${input}` : input;
    return browserFetch(requestUrl, init);
  };
  window.__smartDispatchApiConfigured = true;
}

export default function DesktopApp() {
  const [session, setSession] = useState(() => getSession());
  const [showLogin, setShowLogin] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  function signOut() {
    clearSession();
    setSession(null);
  }

  async function login(event) {
    event.preventDefault();
    setLoginMessage('');
    setIsLoggingIn(true);

    try {
      const loginAttempts = [
        {
          role: 'Admin',
          endpoint: '/api/auth/login',
          body: { email: identifier.trim(), password }
        },
        {
          role: 'Hospital',
          endpoint: '/api/auth/hospital-login',
          body: { phone: identifier.trim(), password }
        },
        {
          role: 'Driver',
          endpoint: '/api/auth/driver-login',
          body: { phone: identifier.trim(), password }
        }
      ];

      for (const attempt of loginAttempts) {
        const response = await fetch(attempt.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(attempt.body)
        });

        if (response.status === 401 || response.status === 403) continue;
        if (!response.ok) {
          const detail = await response.text();
          setLoginMessage(detail || `Login failed (HTTP ${response.status}).`);
          return;
        }

        const data = await response.json();
        if (!data.token || (attempt.role === 'Admin' && data.role !== 'Admin') ||
            (attempt.role === 'Hospital' && data.hospitalId == null) ||
            (attempt.role === 'Driver' && data.ambulanceId == null)) {
          throw new Error('The server returned an incomplete login session.');
        }

        const nextSession = {
          token: data.token,
          role: attempt.role,
          hospitalId: data.hospitalId,
          ambulanceId: data.ambulanceId
        };
        saveSession(nextSession);
        setSession(nextSession);
        setShowLogin(false);
        setIdentifier('');
        setPassword('');
        return;
      }

      setLoginMessage('Login failed. Check your email or phone number and password.');
    } catch (error) {
      console.error('Login error:', error);
      setLoginMessage(error.message || 'Could not connect to the authentication service.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  if (session?.role === 'Admin') {
    return <CommandCenterPortal onSignOut={signOut} />;
  }
  if (session?.role === 'Hospital' || session?.role === 'Driver') {
    return <HospitalDriverPortal initialSubTab={session.role === 'Driver' ? 'driver' : 'hospital'} onSignOut={signOut} />;
  }

  return (
    <>
      <main className="app-shell">
        <section className="portal-content-panel">
          <CitizenEmergencyView
            onLogin={() => {
              setLoginMessage('');
              setShowLogin(true);
            }}
          />
        </section>
      </main>

      {showLogin && (
        <div className="simple-modal-backdrop" onClick={() => setShowLogin(false)}>
          <section
            className="simple-modal-card unified-login-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unified-login-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-top">
              <h3 id="unified-login-title">Sign in to Smart Dispatch</h3>
              <button type="button" aria-label="Close login" onClick={() => setShowLogin(false)}>×</button>
            </div>
            <p className="unified-login-intro">Sign in with your registered email or phone number and password. Your dashboard opens automatically.</p>
            <form className="hospital-login-form" onSubmit={login}>
              <div className="simple-form-group">
                <label>Email or phone number</label>
                <input
                  className="simple-text-input"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </div>
              <div className="simple-form-group">
                <label>Password</label>
                <input
                  className="simple-text-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {loginMessage && <p className="status-message error">{loginMessage}</p>}
              <button
                className="simple-primary-btn"
                type="submit"
                disabled={isLoggingIn || !identifier || !password}
              >
                {isLoggingIn ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
