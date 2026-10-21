import React, { useEffect, useState } from 'react';
import CitizenEmergencyView from './components/CitizenEmergencyView';
import HospitalDriverPortal from './components/HospitalDriverPortal';
import CommandCenterPortal from './components/CommandCenterPortal';
import MasterHubView from './components/MasterHubView';
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

function resolveActiveMode() {
  if (typeof window === 'undefined') return { mode: 'hub', port: '3000' };

  // 1. Injected port by multi-server
  const injectedPort = window.__SMART_DISPATCH_PORT__;
  const currentPort = injectedPort ? String(injectedPort) : window.location.port;

  // 2. Query param overrides
  try {
    const params = new URLSearchParams(window.location.search);
    const queryUi = params.get('ui') || params.get('mode') || params.get('view');
    if (queryUi) return { mode: queryUi, port: currentPort || '3000' };
    const queryPort = params.get('port');
    if (queryPort === '3001') return { mode: 'emergency', port: '3001' };
    if (queryPort === '3002') return { mode: 'hospital-driver', port: '3002' };
    if (queryPort === '3003') return { mode: 'command', port: '3003' };
    if (queryPort === '3000') return { mode: 'hub', port: '3000' };
  } catch (e) {}

  // 3. Port matching
  if (currentPort === '3001') return { mode: 'emergency', port: '3001' };
  if (currentPort === '3002') return { mode: 'hospital-driver', port: '3002' };
  if (currentPort === '3003') return { mode: 'command', port: '3003' };
  if (currentPort === '3000') return { mode: 'hub', port: '3000' };

  // Default for Expo 8081 or others
  return { mode: 'hub', port: currentPort || '8081' };
}

export default function DesktopApp() {
  const [resolved, setResolved] = useState(() => resolveActiveMode());
  const [mode, setMode] = useState(resolved.mode);
  const [currentPort, setCurrentPort] = useState(resolved.port);

  useEffect(() => {
    const next = resolveActiveMode();
    setMode(next.mode);
    setCurrentPort(next.port);

    const handlePopState = () => {
      const updated = resolveActiveMode();
      setMode(updated.mode);
      setCurrentPort(updated.port);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function switchView(newMode) {
    setMode(newMode);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('ui', newMode);
      window.history.pushState({}, '', url.toString());
    } catch (e) {}
  }

  function renderActiveView() {
    switch (mode) {
      case 'emergency':
        return <CitizenEmergencyView />;
      case 'hospital-driver':
      case 'driver':
      case 'hospital':
        return <HospitalDriverPortal initialSubTab={mode === 'hospital' ? 'hospital' : 'driver'} />;
      case 'command':
      case 'admin':
      case 'history':
      case 'reports':
        return <CommandCenterPortal />;
      case 'hub':
      default:
        return <MasterHubView onSwitchView={switchView} />;
    }
  }

  return (
    <main className="app-shell">
      <section className="portal-content-panel">
        {renderActiveView()}
      </section>
    </main>
  );
}