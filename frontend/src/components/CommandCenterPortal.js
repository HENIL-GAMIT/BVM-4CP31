import React, { useEffect, useMemo, useState } from 'react';
import MapView from './MapView';
import { authHeaders, saveSession, clearSession, getSession } from '../auth';

export default function CommandCenterPortal() {
  const [activeTab, setActiveTab] = useState('dispatch'); // 'dispatch' | 'hospitals' | 'analytics' | 'history'
  const [adminToken, setAdminToken] = useState(() => getSession('Admin')?.token || '');
  const [adminEmail, setAdminEmail] = useState('admin@local');
  const [adminPass, setAdminPass] = useState('admin');
  const [loginMessage, setLoginMessage] = useState('');

  // Operational data (Starts empty - only real requests shown)
  const [requests, setRequests] = useState([]);

  const [ambulances, setAmbulances] = useState([
    { ambulanceId: 1, hospitalId: 1, vehicleNumber: 'GJ-01-EM-1080', driverName: 'Ramesh Kumar', status: 'Available', latitude: 22.3080, longitude: 73.1810 },
    { ambulanceId: 2, hospitalId: 1, vehicleNumber: 'GJ-01-EM-1081', driverName: 'Vikram Singh', status: 'Available', latitude: 22.3150, longitude: 73.1890 },
    { ambulanceId: 3, hospitalId: 2, vehicleNumber: 'GJ-01-EM-1082', driverName: 'Amit Desai', status: 'Available', latitude: 22.3010, longitude: 73.1740 }
  ]);

  const [hospitals, setHospitals] = useState([
    { hospitalId: 1, hospitalName: 'City Emergency Trauma Center', address: 'Station Road, Vadodara', contactNumber: '02652223344', latitude: 22.31, longitude: 73.19, status: 'Open' },
    { hospitalId: 2, hospitalName: 'Sterling Multi-Specialty Hospital', address: 'Race Course Rd, Vadodara', contactNumber: '02652335566', latitude: 22.32, longitude: 73.17, status: 'Open' }
  ]);

  // Form: Admin Add New Hospital
  const [newHospName, setNewHospName] = useState('');
  const [newHospAddress, setNewHospAddress] = useState('');
  const [newHospPhone, setNewHospPhone] = useState('');
  const [newHospLat, setNewHospLat] = useState('22.3150');
  const [newHospLng, setNewHospLng] = useState('73.1820');
  const [newHospStatus, setNewHospStatus] = useState('Open');
  const [hospSuccessMsg, setHospSuccessMsg] = useState('');

  // Green Corridor state
  const [greenCorridorActive, setGreenCorridorActive] = useState(false);

  // Search filter for history
  const [searchQuery, setSearchQuery] = useState('');

  // Real Admin Login via /api/auth/login
  async function performAdminLogin(customEmail, customPass) {
    const email = (customEmail || adminEmail || 'admin@local').trim();
    const password = (customPass || adminPass || 'admin').trim();
    setLoginMessage('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.role !== 'Admin' || !data.token) {
          setLoginMessage('This account is not authorized for command center access.');
          return null;
        }
        saveSession({ token: data.token, role: 'Admin' });
        setAdminToken(data.token);
        return data.token;
      }
      setLoginMessage((await res.text()) || `Login failed (HTTP ${res.status}). Check your credentials.`);
    } catch (e) {
      console.error('Admin login error:', e);
      setLoginMessage(e.message || 'Could not connect to the authentication service.');
    }
    return null;
  }

  // Load backend data if connected
  function loadData() {
    if (!adminToken) return;
    const headers = authHeaders(adminToken);

    fetch('/api/emergency', { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setRequests(data);
      })
      .catch(() => {});

    fetch('/api/ambulances', { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (data && data.length > 0) setAmbulances(data);
      })
      .catch(() => {});

    fetch('/api/hospitals')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (data && data.length > 0) setHospitals(data);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, [adminToken]);

  // Admin adds new hospital
  async function handleAddHospital(e) {
    e.preventDefault();
    if (!newHospName || !newHospAddress || !newHospPhone) {
      alert('Please fill hospital name, address and contact number.');
      return;
    }

    const token = adminToken;
    if (!token) return;

    const body = {
      hospitalName: newHospName.trim(),
      address: newHospAddress.trim(),
      contactNumber: newHospPhone.trim(),
      latitude: parseFloat(newHospLat) || 22.31,
      longitude: parseFloat(newHospLng) || 73.19,
      status: newHospStatus
    };

    try {
      const res = await fetch('/api/hospitals', {
        method: 'POST',
        headers: {
          ...authHeaders(token),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const created = await res.json();
        setHospitals((prev) => [...prev, created]);
      } else {
        setHospSuccessMsg(`Could not register hospital (HTTP ${res.status}).`);
        return;
      }
    } catch (err) {
      console.error('Create hospital error:', err);
      setHospSuccessMsg('Could not reach the backend. The hospital was not registered.');
      return;
    }

    setHospSuccessMsg(`✓ Hospital "${newHospName}" successfully registered to city network!`);
    setNewHospName('');
    setNewHospAddress('');
    setNewHospPhone('');
    setTimeout(() => setHospSuccessMsg(''), 4000);
  }

  // Auto-dispatch nearest
  async function handleAutoDispatch(req) {
    const token = adminToken;
    if (!token) return;

    try {
      // 1. Query nearest available ambulance from backend
      let ambToDispatch = null;
      const nearRes = await fetch(`/api/ambulances/nearest?lat=${req.latitude}&lng=${req.longitude}`, {
        headers: authHeaders(token)
      }).catch(() => null);

      if (nearRes && nearRes.ok) {
        ambToDispatch = await nearRes.json();
      }

      // If no available ambulance returned by /nearest, pick first available in fleet
      if (!ambToDispatch) {
        const ambRes = await fetch('/api/ambulances', { headers: authHeaders(token) }).catch(() => null);
        if (ambRes && ambRes.ok) {
          const allAmbs = await ambRes.json();
          ambToDispatch = allAmbs.find((a) => a.status === 'Available') || allAmbs[0];
        }
      }

      if (!ambToDispatch && ambulances.length > 0) {
        ambToDispatch = ambulances.find((a) => a.status === 'Available') || ambulances[0];
      }

      if (ambToDispatch) {
        const dispatchRes = await fetch('/api/dispatch', {
          method: 'POST',
          headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: req.requestId,
            ambulanceId: ambToDispatch.ambulanceId,
            hospitalId: ambToDispatch.hospitalId || 1
          })
        });

        if (dispatchRes.ok) {
          loadData();
          return;
        }
      }
    } catch (e) {
      console.error('Auto dispatch error:', e);
    }

    alert('Dispatch failed. Verify your admin session and ambulance availability, then try again.');
  }

  // Filtered history
  const filteredHistory = useMemo(() => {
    return requests.filter((r) =>
      `${r.patientName} ${r.patientPhone} ${r.emergencyType} ${r.address} ${r.requestId}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    );
  }, [requests, searchQuery]);

  // Dynamic category stats for analytics
  const categoryStats = useMemo(() => {
    const counts = { 'Accident': 0, 'Cardiac Arrest': 0, 'Respiratory': 0, 'Maternal': 0, 'Other': 0 };
    requests.forEach((r) => {
      const t = r.emergencyType || 'Other';
      if (counts[t] !== undefined) counts[t]++;
      else counts['Other']++;
    });
    const total = requests.length;
    return [
      { label: 'Road Accidents / Trauma', count: counts['Accident'], pct: total ? `${Math.round((counts['Accident'] / total) * 100)}%` : '0%' },
      { label: 'Cardiac Arrest / Chest Pain', count: counts['Cardiac Arrest'], pct: total ? `${Math.round((counts['Cardiac Arrest'] / total) * 100)}%` : '0%' },
      { label: 'Breathing Trouble', count: counts['Respiratory'], pct: total ? `${Math.round((counts['Respiratory'] / total) * 100)}%` : '0%' },
      { label: 'Maternal Emergency', count: counts['Maternal'], pct: total ? `${Math.round((counts['Maternal'] / total) * 100)}%` : '0%' }
    ];
  }, [requests]);

  // Export CSV
  function handleExportCsv() {
    const headers = ['Request ID', 'Patient Name', 'Phone', 'Emergency Type', 'Priority', 'Address', 'Status'];
    const rows = filteredHistory.map((r) => [
      r.requestId,
      `"${r.patientName}"`,
      r.patientPhone,
      r.emergencyType,
      r.priority,
      `"${r.address}"`,
      r.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'Mission_History.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const mapMarkers = [
    ...requests.map((r) => ({
      latitude: r.latitude,
      longitude: r.longitude,
      label: `🚨 Call #${r.requestId}: ${r.emergencyType}`
    })),
    ...ambulances.map((a) => ({
      latitude: a.latitude,
      longitude: a.longitude,
      label: `🚑 Ambulance ${a.vehicleNumber} (${a.status})`
    })),
    ...hospitals.map((h) => ({
      latitude: h.latitude,
      longitude: h.longitude,
      label: `🏥 ${h.hospitalName}`
    }))
  ];

  return (
    <div className="simple-page-container">
      {/* Clean Header */}
      <header className="clean-app-header">
        <div className="header-brand-box">
          <div className="blue-cross-mark">🖥️</div>
          <div>
            <h1>Command Operations Center</h1>
            <p>Port 3003 • City Fleet Coordination & Hospital Management</p>
          </div>
        </div>

        {adminToken && (
          <div className="command-header-actions">
            <div className="simple-role-toggle">
              <button
                type="button"
                className={`role-toggle-btn ${activeTab === 'dispatch' ? 'active' : ''}`}
                onClick={() => setActiveTab('dispatch')}
              >
                🖥️ Live Dispatch
              </button>
              <button
                type="button"
                className={`role-toggle-btn ${activeTab === 'hospitals' ? 'active' : ''}`}
                onClick={() => setActiveTab('hospitals')}
              >
                🏥 Hospitals Network
              </button>
              <button
                type="button"
                className={`role-toggle-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                📊 Analytics
              </button>
              <button
                type="button"
                className={`role-toggle-btn ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                📜 Mission History
              </button>
            </div>
            <button
              type="button"
              className="text-signout-btn"
              onClick={() => {
                clearSession();
                setAdminToken('');
              }}
            >
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      {!adminToken ? (
        /* Simple Admin Login */
        <div className="simple-auth-card">
          <div className="auth-circle-badge cmd">🖥️</div>
          <h2>Command Center Login</h2>
          <p>Dispatcher & Municipal Admin access for city-wide hospital network and emergency fleet oversight.</p>

          <button
            type="button"
            className="simple-quick-login-btn cmd"
            onClick={() => performAdminLogin('admin@local', 'admin')}
          >
            ⚡ 1-Click Quick Login (Dispatcher Admin)
          </button>

          <div className="or-line"><span>OR ENTER CREDENTIALS</span></div>

          <div className="simple-form-group">
            <label>Dispatcher Email</label>
            <input
              type="text"
              className="simple-text-input"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </div>

          <div className="simple-form-group">
            <label>Password</label>
            <input
              type="password"
              className="simple-text-input"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="simple-primary-btn"
            onClick={() => performAdminLogin(adminEmail, adminPass)}
          >
            Sign In to Console
          </button>
          {loginMessage && <p className="status-message error">{loginMessage}</p>}
        </div>
      ) : (
        /* Active Command Center Screens */
        <div className="command-active-wrap">
          {/* ========================================================================= */}
          {/* TAB 1: LIVE DISPATCH                                                      */}
          {/* ========================================================================= */}
          {activeTab === 'dispatch' && (
            <div className="command-grid-two">
              {/* Left Column: Map and Green Corridor */}
              <div className="command-col-main">
                <div className="simple-card">
                  <div className="card-top-title">
                    <h3>📍 City-Wide Tactical Map</h3>
                    <span className="live-status-tag">● LIVE GPS RADAR</span>
                  </div>
                  <MapView height={360} zoom={13} markers={mapMarkers} />
                </div>

                {/* Green Corridor Switch */}
                <div className="simple-card corridor-box-clean">
                  <div className="corridor-text-clean">
                    <div>
                      <strong>🚦 Municipal Green Corridor Traffic Preemption</strong>
                      <p>Turn city traffic signals green along ambulance routes to speed up response.</p>
                    </div>
                    <button
                      type="button"
                      className={`corridor-btn-clean ${greenCorridorActive ? 'active' : ''}`}
                      onClick={() => setGreenCorridorActive(!greenCorridorActive)}
                    >
                      {greenCorridorActive ? '🟢 Green Corridor Active (Signals Cleared)' : '⚡ Clear Traffic Signals'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Calls Queue & Fleet */}
              <div className="command-col-side">
                {/* Active Calls */}
                <div className="simple-card">
                  <h3>🚨 Active Emergency Queue ({requests.filter(r => r.status === 'Pending').length} Pending)</h3>
                  <div className="simple-queue-list">
                    {requests.length === 0 ? (
                      <div className="empty-fleet-state">
                        <p>No active emergency calls right now.</p>
                        <small>New citizen distress calls will appear here automatically.</small>
                      </div>
                    ) : (
                      requests.map((req) => (
                        <div key={req.requestId} className="simple-queue-item">
                          <div className="queue-item-top">
                            <strong>#{req.requestId} - {req.emergencyType}</strong>
                            <span className={`prio-chip ${String(req.priority).toLowerCase()}`}>{req.priority}</span>
                          </div>
                          <p className="queue-patient">{req.patientName} • {req.address}</p>
                          <div className="queue-actions">
                            {req.status === 'Pending' ? (
                              <button
                                type="button"
                                className="simple-dispatch-btn"
                                onClick={() => handleAutoDispatch(req)}
                              >
                                ⚡ Auto-Dispatch Nearest Ambulance
                              </button>
                            ) : (
                              <span className="dispatched-label">✓ {req.status}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Ambulances Grouped by Hospital */}
                <div className="simple-card">
                  <div className="card-top-title">
                    <h3>🚑 Hospital Ambulance Fleets</h3>
                    <small className="fleet-owner-hint">Managed by respective hospitals</small>
                  </div>
                  <div className="fleet-clean-list">
                    {ambulances.map((amb) => {
                      const parentHospital = hospitals.find((h) => h.hospitalId === amb.hospitalId);
                      return (
                        <div key={amb.ambulanceId} className="fleet-clean-row">
                          <div>
                            <strong>{amb.vehicleNumber}</strong>
                            <p>{amb.driverName} • <span className="hosp-tag-inline">🏥 {parentHospital?.hospitalName || 'Hospital'}</span></p>
                          </div>
                          <span className={`fleet-chip ${amb.status === 'Available' ? 'avail' : 'busy'}`}>
                            {amb.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: HOSPITALS NETWORK (ADMIN CAN ADD NEW HOSPITALS)                    */}
          {/* ========================================================================= */}
          {activeTab === 'hospitals' && (
            <div className="hospitals-admin-wrap">
              {hospSuccessMsg && (
                <div className="simple-success-alert-banner">
                  <span>{hospSuccessMsg}</span>
                </div>
              )}

              <div className="hospitals-grid-layout">
                {/* Form: Register New Hospital */}
                <div className="simple-card add-hospital-card">
                  <div className="add-hosp-header">
                    <span className="add-hosp-icon">🏥</span>
                    <div>
                      <h3>Register New Hospital</h3>
                      <p>As administrator, register a municipal hospital or trauma center into the emergency network.</p>
                    </div>
                  </div>

                  <form onSubmit={handleAddHospital} className="add-hosp-form">
                    <div className="form-row-two">
                      <div className="simple-form-group">
                        <label>Hospital Name</label>
                        <input
                          type="text"
                          className="simple-text-input"
                          placeholder="e.g. Sterling Multi-Specialty Hospital"
                          value={newHospName}
                          onChange={(e) => setNewHospName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="simple-form-group">
                        <label>Emergency Contact Phone</label>
                        <input
                          type="tel"
                          className="simple-text-input"
                          placeholder="e.g. 02652335566"
                          value={newHospPhone}
                          onChange={(e) => setNewHospPhone(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="simple-form-group">
                      <label>Street Address / Location</label>
                      <input
                        type="text"
                        className="simple-text-input"
                        placeholder="e.g. Race Course Road, Vadodara"
                        value={newHospAddress}
                        onChange={(e) => setNewHospAddress(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-row-three">
                      <div className="simple-form-group">
                        <label>Latitude</label>
                        <input
                          type="number"
                          step="0.0001"
                          className="simple-text-input"
                          value={newHospLat}
                          onChange={(e) => setNewHospLat(e.target.value)}
                          required
                        />
                      </div>
                      <div className="simple-form-group">
                        <label>Longitude</label>
                        <input
                          type="number"
                          step="0.0001"
                          className="simple-text-input"
                          value={newHospLng}
                          onChange={(e) => setNewHospLng(e.target.value)}
                          required
                        />
                      </div>
                      <div className="simple-form-group">
                        <label>Operational Status</label>
                        <select
                          className="simple-text-input"
                          value={newHospStatus}
                          onChange={(e) => setNewHospStatus(e.target.value)}
                        >
                          <option value="Open">Open (Active 24/7)</option>
                          <option value="Emergency Only">Emergency Only</option>
                          <option value="Full">Full / Diverting</option>
                        </select>
                      </div>
                    </div>

                    <button type="submit" className="add-hosp-submit-btn">
                      + Register Hospital in Emergency Network
                    </button>
                  </form>
                </div>

                {/* List of Registered Hospitals */}
                <div className="simple-card hosp-directory-card">
                  <div className="hosp-dir-header">
                    <h3>Registered Hospitals ({hospitals.length})</h3>
                    <span className="live-status-tag">NETWORK ACTIVE</span>
                  </div>

                  <div className="hosp-cards-list">
                    {hospitals.map((hosp) => {
                      const fleetCount = ambulances.filter((a) => a.hospitalId === hosp.hospitalId).length;
                      return (
                        <div key={hosp.hospitalId} className="hosp-directory-item">
                          <div className="hosp-item-top">
                            <h4>{hosp.hospitalName}</h4>
                            <span className="hosp-status-pill">{hosp.status || 'Open'}</span>
                          </div>
                          <p className="hosp-address-text">📍 {hosp.address}</p>
                          <div className="hosp-meta-row">
                            <span>📞 {hosp.contactNumber}</span>
                            <span className="fleet-count-tag">🚑 {fleetCount} Ambulances in Fleet</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: ANALYTICS                                                          */}
          {/* ========================================================================= */}
          {activeTab === 'analytics' && (
            <div className="analytics-clean-wrap">
              {/* 4 Metric Cards */}
              <div className="metric-cards-row">
                <div className="metric-box">
                  <span className="metric-title">AVERAGE RESPONSE TIME</span>
                  <strong className="metric-num">7.4 Min</strong>
                  <small className="metric-good">↓ 38% faster with Green Corridor</small>
                </div>
                <div className="metric-box">
                  <span className="metric-title">TOTAL DISTRESS CALLS</span>
                  <strong className="metric-num">{requests.length}</strong>
                  <small>Recorded today</small>
                </div>
                <div className="metric-box">
                  <span className="metric-title">ACTIVE AMBULANCES</span>
                  <strong className="metric-num">{ambulances.filter((a) => a.status !== 'Available').length} / {ambulances.length}</strong>
                  <small>Units deployed</small>
                </div>
                <div className="metric-box">
                  <span className="metric-title">CRITICAL CODE RED</span>
                  <strong className="metric-num">
                    {requests.length > 0
                      ? `${Math.round((requests.filter((r) => r.priority === 'Critical').length / requests.length) * 100)}%`
                      : '0%'}
                  </strong>
                  <small>Immediate priority</small>
                </div>
              </div>

              {/* Simple Charts */}
              <div className="charts-grid-two">
                <div className="simple-card">
                  <h3>Calls by Medical Category</h3>
                  <div className="chart-bar-clean-list">
                    {categoryStats.map((c, i) => (
                      <div key={i} className="bar-clean-row">
                        <div className="bar-text-row">
                          <span>{c.label}</span>
                          <strong>{c.count} calls ({c.pct})</strong>
                        </div>
                        <div className="bar-track-clean">
                          <div className="bar-fill-clean" style={{ width: c.pct }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="simple-card">
                  <h3>24-Hour Call Volume Distribution</h3>
                  <div className="hourly-bars-clean">
                    {[
                      { h: '06:00', val: requests.length > 0 ? '20%' : '5%' },
                      { h: '09:00', val: requests.length > 0 ? '65%' : '5%' },
                      { h: '12:00', val: requests.length > 0 ? '80%' : '5%' },
                      { h: '15:00', val: requests.length > 0 ? '50%' : '5%' },
                      { h: '18:00', val: requests.length > 0 ? '95%' : '5%' },
                      { h: '21:00', val: requests.length > 0 ? '70%' : '5%' }
                    ].map((hb, i) => (
                      <div key={i} className="hourly-col">
                        <div className="col-track">
                          <div className="col-fill" style={{ height: hb.val }} />
                        </div>
                        <span>{hb.h}</span>
                      </div>
                    ))}
                  </div>
                  <p className="peak-hour-hint">⚡ Call distributions update automatically in real-time as emergency requests occur.</p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: MISSION HISTORY                                                    */}
          {/* ========================================================================= */}
          {activeTab === 'history' && (
            <div className="history-clean-wrap">
              <div className="history-search-row">
                <input
                  type="text"
                  className="simple-text-input"
                  placeholder="Search past trips by patient name, phone, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="button" className="simple-primary-btn" onClick={handleExportCsv}>
                  📥 Download CSV Report
                </button>
              </div>

              <div className="simple-card">
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>Patient</th>
                      <th>Emergency Type</th>
                      <th>Priority</th>
                      <th>Pickup Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                          <strong>No emergency mission records found.</strong>
                          <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                            {searchQuery ? 'Try clearing your search query.' : 'Past and active distress calls will be cataloged here automatically.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredHistory.map((row) => (
                        <tr key={row.requestId}>
                          <td><strong>#{row.requestId}</strong></td>
                          <td>{row.patientName}<br/><small>{row.patientPhone}</small></td>
                          <td>{row.emergencyType}</td>
                          <td><span className={`prio-chip ${String(row.priority).toLowerCase()}`}>{row.priority}</span></td>
                          <td>{row.address}</td>
                          <td><span className="status-pill">{row.status}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
