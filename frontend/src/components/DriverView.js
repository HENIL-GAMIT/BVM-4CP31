import React, { useEffect, useState, useRef } from 'react';
import MapView from './MapView';
import { authHeaders, saveSession, clearSession } from '../auth';

export default function DriverView() {
  const [ambulanceId, setAmbulanceId] = useState(localStorage.getItem('driverAmbulanceId') || '');
  const [dispatches, setDispatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [phone, setPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [token, setToken] = useState(localStorage.getItem('role') === 'Driver' ? localStorage.getItem('token') || '' : '');
  const [sharingLocation, setSharingLocation] = useState(false);
  const [coords, setCoords] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [activeTab, setActiveTab] = useState('mission'); // 'mission' | 'map' | 'dispatches'

  const timer = useRef(null);
  const locationTimer = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  async function load() {
    if (!ambulanceId) return;
    try {
      const headers = authHeaders(token);
      const res = await fetch(`/api/dispatch/ambulance/${ambulanceId}`, { headers });
      if (res.ok) {
        const nextDispatches = await res.json();
        setDispatches(nextDispatches);

        // Auto-select latest active dispatch if none selected or if matching existing
        if (selectedRef.current) {
          const current = nextDispatches.find((d) => d.dispatchId === selectedRef.current.dispatch.dispatchId);
          if (current) loadPatient(current);
        } else if (nextDispatches.length > 0) {
          const active = nextDispatches.find((d) => d.status !== 'Completed') || nextDispatches[0];
          loadPatient(active);
        }
      }
    } catch (e) {
      console.error('Failed to load dispatches', e);
    }
  }

  useEffect(() => {
    if (ambulanceId && token) {
      load();
      timer.current = setInterval(load, 4000);
      return () => clearInterval(timer.current);
    }
  }, [ambulanceId, token]);

  function startLocationSharing() {
    if (!ambulanceId || !navigator.geolocation) {
      setGpsError('Geolocation is not supported by this phone browser.');
      return;
    }

    setGpsError('');
    const publishLocation = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      setCoords({ latitude, longitude, accuracy });
      setLastUpdated(new Date().toLocaleTimeString());

      fetch(`/api/ambulances/${ambulanceId}/location?latitude=${latitude}&longitude=${longitude}`, {
        method: 'PUT',
        headers: authHeaders(token)
      }).catch((err) => console.error('Location sync error', err));
    };

    const handleGpsError = (err) => {
      console.error('GPS error:', err);
      if (err.code === 1) {
        setGpsError('Location permission denied. Please allow GPS access in your browser settings.');
      } else {
        setGpsError(`GPS signal unavailable (${err.message}). Retrying...`);
      }
    };

    navigator.geolocation.getCurrentPosition(publishLocation, handleGpsError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    if (locationTimer.current) {
      navigator.geolocation.clearWatch(locationTimer.current);
    }

    locationTimer.current = navigator.geolocation.watchPosition(publishLocation, handleGpsError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    });

    setSharingLocation(true);
  }

  function stopLocationSharing() {
    if (locationTimer.current && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationTimer.current);
      locationTimer.current = null;
    }
    setSharingLocation(false);
  }

  useEffect(() => {
    return () => {
      if (locationTimer.current && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationTimer.current);
      }
    };
  }, []);

  async function loadPatient(dispatch) {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [r, amb, hospitalResponse] = await Promise.all([
        fetch(`/api/emergency/${dispatch.requestId}`, { headers }),
        fetch(`/api/ambulances/${dispatch.ambulanceId}`, { headers }),
        fetch(`/api/hospitals/${dispatch.hospitalId}`, { headers })
      ]);

      const patient = r.ok ? await r.json() : null;
      const ambulance = amb.ok ? await amb.json() : null;
      const hospital = hospitalResponse.ok ? await hospitalResponse.json() : null;
      setSelected({ dispatch, patient, ambulance, hospital });
    } catch (e) {
      console.error('Error loading patient details', e);
    }
  }

  async function updateStatus(newStatus) {
    if (!selected?.dispatch?.dispatchId) return;
    try {
      const res = await fetch(`/api/dispatch/${selected.dispatch.dispatchId}`, {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        await load();
      } else {
        alert('Failed to update status');
      }
    } catch (e) {
      alert('Network error while updating status');
    }
  }

  async function driverLogin() {
    if (!phone || !vehicleNumber) {
      alert('Please enter both driver phone and vehicle number.');
      return;
    }
    try {
      const res = await fetch('/api/auth/driver-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), vehicleNumber: vehicleNumber.trim() })
      });
      if (!res.ok) {
        const text = await res.text();
        alert('Login failed: ' + text);
        return;
      }
      const data = await res.json();
      saveSession({ token: data.token, role: 'Driver', ambulanceId: data.ambulanceId });
      setToken(data.token);
      setAmbulanceId(String(data.ambulanceId));
    } catch (e) {
      alert('Network error during login');
    }
  }

  function handleLogout() {
    stopLocationSharing();
    clearSession();
    setToken('');
    setAmbulanceId('');
    setSelected(null);
    setDispatches([]);
  }

  const markers = [];
  if (coords) {
    markers.push({ latitude: coords.latitude, longitude: coords.longitude, label: 'Your Ambulance (Live GPS)' });
  } else if (selected?.ambulance?.latitude && selected?.ambulance?.longitude) {
    markers.push({ latitude: selected.ambulance.latitude, longitude: selected.ambulance.longitude, label: `Ambulance ${selected.ambulance.vehicleNumber}` });
  }
  if (selected?.patient?.latitude && selected?.patient?.longitude) {
    markers.push({ latitude: selected.patient.latitude, longitude: selected.patient.longitude, label: `Patient: ${selected.patient.patientName}` });
  }
  if (selected?.hospital?.latitude && selected?.hospital?.longitude) {
    markers.push({ latitude: selected.hospital.latitude, longitude: selected.hospital.longitude, label: `Hospital: ${selected.hospital.hospitalName}` });
  }

  const activeDispatch = selected?.dispatch;
  const patient = selected?.patient;
  const hospital = selected?.hospital;
  const ambulance = selected?.ambulance;

  return (
    <div className="driver-mobile-container">
      {!token ? (
        <div className="driver-login-screen">
          <div className="driver-login-card">
            <div className="driver-badge-icon">🚑</div>
            <h2>Driver Portal</h2>
            <p className="driver-login-subtitle">Sign in from your smartphone to receive dispatch alerts and broadcast live GPS.</p>

            <div className="driver-field-group">
              <label htmlFor="driver-phone">Driver Phone Number</label>
              <input
                id="driver-phone"
                type="tel"
                placeholder="e.g. 9999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>

            <div className="driver-field-group">
              <label htmlFor="vehicle-num">Vehicle Plate Number</label>
              <input
                id="vehicle-num"
                type="text"
                placeholder="e.g. GJ-01-DEM or MH-02-1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                autoCapitalize="characters"
              />
            </div>

            <button className="driver-big-btn primary" onClick={driverLogin} type="button">
              Sign In to Ambulance
            </button>
          </div>
        </div>
      ) : (
        <div className="driver-dashboard">
          {/* Top Bar for Mobile Phone */}
          <header className="driver-phone-bar">
            <div className="driver-bar-info">
              <span className="driver-vehicle-badge">🚑 #{ambulanceId}</span>
              <span className="driver-duty-status">On Duty</span>
            </div>
            <div className="driver-bar-actions">
              <button className="driver-mini-btn" onClick={load} title="Refresh missions" type="button">
                🔄 Refresh
              </button>
              <button className="driver-mini-btn danger" onClick={handleLogout} title="Sign Out" type="button">
                Sign Out
              </button>
            </div>
          </header>

          {/* Live GPS Broadcast Card - Prominent for Mobile Use */}
          <section className="driver-gps-card">
            <div className="driver-gps-header">
              <div className="driver-gps-indicator">
                <span className={`radar-pulse ${sharingLocation ? 'active' : ''}`} />
                <div>
                  <strong>{sharingLocation ? 'Live GPS Broadcasting' : 'GPS Broadcast Paused'}</strong>
                  <span className="driver-gps-sub">
                    {sharingLocation
                      ? coords
                        ? `Lat: ${coords.latitude.toFixed(5)}, Lng: ${coords.longitude.toFixed(5)} (±${Math.round(coords.accuracy || 0)}m)`
                        : 'Broadcasting location...'
                      : 'Patients & Dispatch cannot see your live position'}
                  </span>
                </div>
              </div>

              <button
                className={`driver-toggle-btn ${sharingLocation ? 'active' : ''}`}
                onClick={sharingLocation ? stopLocationSharing : startLocationSharing}
                type="button"
              >
                {sharingLocation ? 'Stop GPS' : 'Start GPS'}
              </button>
            </div>

            {lastUpdated && (
              <div className="driver-gps-meta">
                <span>Last updated: {lastUpdated}</span>
              </div>
            )}

            {gpsError && (
              <div className="driver-gps-error">
                <span>⚠️ {gpsError}</span>
              </div>
            )}
          </section>

          {/* Mobile Tab Switcher */}
          <nav className="driver-mobile-tabs" aria-label="Driver views">
            <button
              className={`driver-tab ${activeTab === 'mission' ? 'active' : ''}`}
              onClick={() => setActiveTab('mission')}
              type="button"
            >
              🚨 Mission {activeDispatch ? `(#${activeDispatch.dispatchId})` : ''}
            </button>
            <button
              className={`driver-tab ${activeTab === 'map' ? 'active' : ''}`}
              onClick={() => setActiveTab('map')}
              type="button"
            >
              🗺️ Map View
            </button>
            <button
              className={`driver-tab ${activeTab === 'dispatches' ? 'active' : ''}`}
              onClick={() => setActiveTab('dispatches')}
              type="button"
            >
              📋 All ({dispatches.length})
            </button>
          </nav>

          {/* Main Content Area */}
          <div className="driver-content-layout">
            {/* Mission Tab / Panel */}
            <div className={`driver-tab-panel ${activeTab === 'mission' ? 'visible-mobile' : 'hidden-mobile'}`}>
              {activeDispatch && patient ? (
                <div className="driver-mission-card">
                  <div className="driver-mission-header">
                    <span className="driver-kicker">ACTIVE MISSION</span>
                    <span className={`priority-badge ${patient.priority?.toLowerCase() || 'critical'}`}>
                      {patient.priority || 'Critical'} Priority
                    </span>
                  </div>

                  <h3 className="driver-patient-title">{patient.patientName || 'Emergency Patient'}</h3>
                  <div className="driver-incident-tag">Incident: {patient.emergencyType || 'Accident'}</div>

                  {/* Primary One-Tap Actions for Phone Drivers */}
                  <div className="driver-phone-actions">
                    {patient.patientPhone && (
                      <a href={`tel:${patient.patientPhone}`} className="driver-action-btn phone-btn">
                        📞 Call Patient ({patient.patientPhone})
                      </a>
                    )}

                    {patient.latitude && patient.longitude && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${patient.latitude},${patient.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="driver-action-btn nav-btn"
                      >
                        🗺️ Navigate to Patient (Google Maps)
                      </a>
                    )}
                  </div>

                  {/* Location & Destination Info */}
                  <div className="driver-mission-details">
                    <div className="driver-detail-row">
                      <strong>📍 Pickup Location</strong>
                      <span>
                        {patient.address ? `${patient.address} • ` : ''}
                        {patient.latitude}, {patient.longitude}
                      </span>
                    </div>

                    {hospital && (
                      <div className="driver-detail-row hospital-row">
                        <strong>🏥 Destination Hospital</strong>
                        <span>{hospital.hospitalName}</span>
                        <small>{hospital.address}</small>
                        {hospital.latitude && hospital.longitude && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.latitude},${hospital.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="driver-inline-nav"
                          >
                            🏥 Navigate to Hospital in Maps
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Mission Lifecycle Buttons */}
                  <div className="driver-status-section">
                    <span className="driver-status-label">Update Mission Status:</span>
                    <div className="driver-status-grid">
                      <button
                        className={`status-step-btn ${activeDispatch.status === 'En Route' ? 'current' : ''}`}
                        onClick={() => updateStatus('En Route')}
                        type="button"
                      >
                        🚨 En Route
                      </button>
                      <button
                        className={`status-step-btn ${activeDispatch.status === 'Arrived' ? 'current' : ''}`}
                        onClick={() => updateStatus('Arrived')}
                        type="button"
                      >
                        📍 Arrived
                      </button>
                      <button
                        className={`status-step-btn ${activeDispatch.status === 'Transporting' ? 'current' : ''}`}
                        onClick={() => updateStatus('Transporting')}
                        type="button"
                      >
                        🚑 Transporting
                      </button>
                      <button
                        className={`status-step-btn complete ${activeDispatch.status === 'Completed' ? 'current' : ''}`}
                        onClick={() => updateStatus('Completed')}
                        type="button"
                      >
                        ✅ Completed
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="driver-empty-mission">
                  <div className="driver-empty-icon">🚑</div>
                  <h4>No Active Mission</h4>
                  <p>You are on duty. As soon as a hospital assigns an emergency request to your ambulance, it will appear here instantly with full navigation and patient contact buttons.</p>
                  <button className="driver-big-btn secondary" onClick={load} type="button">
                    Check for New Assignments
                  </button>
                </div>
              )}
            </div>

            {/* Map Tab / Panel */}
            <div className={`driver-tab-panel map-panel ${activeTab === 'map' ? 'visible-mobile' : 'hidden-mobile'}`}>
              <div className="driver-map-wrapper">
                <MapView markers={markers} height={380} />
              </div>
              {patient?.latitude && patient?.longitude && (
                <div className="driver-map-footer">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${patient.latitude},${patient.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="driver-action-btn nav-btn"
                  >
                    🗺️ Launch Turn-by-Turn GPS Directions
                  </a>
                </div>
              )}
            </div>

            {/* Dispatches List Tab / Panel */}
            <div className={`driver-tab-panel ${activeTab === 'dispatches' ? 'visible-mobile' : 'hidden-mobile'}`}>
              <div className="driver-dispatch-list">
                <h4>All Assigned Missions</h4>
                {dispatches.length === 0 && (
                  <div className="driver-empty-list">No dispatches found for ambulance #{ambulanceId}.</div>
                )}
                {dispatches.map((d) => (
                  <div
                    key={d.dispatchId}
                    className={`driver-dispatch-card ${selected?.dispatch?.dispatchId === d.dispatchId ? 'selected' : ''}`}
                    onClick={() => {
                      loadPatient(d);
                      setActiveTab('mission');
                    }}
                  >
                    <div className="dispatch-header">
                      <strong>Dispatch #{d.dispatchId}</strong>
                      <span className={`status-pill ${d.status?.toLowerCase()}`}>{d.status}</span>
                    </div>
                    <div className="dispatch-meta">
                      <span>Request: #{d.requestId}</span>
                      <span>Assigned: {new Date(d.assignedTime).toLocaleTimeString()}</span>
                    </div>
                    <button className="driver-select-btn" type="button">
                      {selected?.dispatch?.dispatchId === d.dispatchId ? 'Active Mission ✓' : 'Select Mission'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
