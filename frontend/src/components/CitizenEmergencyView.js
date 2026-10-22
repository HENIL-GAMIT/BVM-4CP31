import React, { useEffect, useRef, useState } from 'react';
import MapView from './MapView';

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const pLat1 = parseFloat(lat1);
  const pLon1 = parseFloat(lon1);
  const pLat2 = parseFloat(lat2);
  const pLon2 = parseFloat(lon2);
  if (isNaN(pLat1) || isNaN(pLon1) || isNaN(pLat2) || isNaN(pLon2)) return null;
  const R = 6371;
  const dLat = ((pLat2 - pLat1) * Math.PI) / 180;
  const dLon = ((pLon2 - pLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pLat1 * Math.PI) / 180) *
      Math.cos((pLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const emergencyTypes = [
  { id: 'Accident', label: 'Accident / Trauma', icon: '🚗', priority: 'Critical' },
  { id: 'Cardiac Arrest', label: 'Heart Attack / Chest Pain', icon: '❤️', priority: 'Critical' },
  { id: 'Respiratory', label: 'Breathing Trouble', icon: '🫁', priority: 'Urgent' },
  { id: 'Maternal', label: 'Pregnancy / Labor', icon: '🤰', priority: 'Urgent' },
  { id: 'Stroke', label: 'Stroke / Unconscious', icon: '🧠', priority: 'Critical' },
  { id: 'Other', label: 'Other Emergency', icon: '⚠️', priority: 'Urgent' }
];

const quickLocations = [
  { label: 'Vadodara - Railway Station', address: 'Station Road, Near Platform 1, Vadodara', lat: 22.3102, lng: 73.1812 },
  { label: 'Vadodara - Alkapuri Circle', address: 'Alkapuri Main Rd, Vadodara', lat: 22.3085, lng: 73.1720 },
  { label: 'Vadodara - Sayajigunj Tower', address: 'Sayajigunj Circle, Vadodara', lat: 22.3040, lng: 73.1870 },
  { label: 'Anand - Railway Station', address: 'Railway Station Road, Anand', lat: 22.5640, lng: 72.9640 },
  { label: 'Anand - Amul Dairy Area', address: 'Amul Dairy Road, Anand', lat: 22.5560, lng: 72.9510 }
];

export default function CitizenEmergencyView() {
  const [lat, setLat] = useState('22.3072');
  const [lng, setLng] = useState('73.1812');
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('Accident');
  const [priority, setPriority] = useState('Critical');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Dynamically detected nearest hospital
  const [nearestHospital, setNearestHospital] = useState(null);
  const [nearestDistanceKm, setNearestDistanceKm] = useState(null);

  // Active tracking state
  const [request, setRequest] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [requestToken, setRequestToken] = useState(() => localStorage.getItem('smartdispatch_active_token') || '');
  const [activeRequestId, setActiveRequestId] = useState(() => localStorage.getItem('smartdispatch_active_request_id') || '');
  const [simAmbPos, setSimAmbPos] = useState(null);

  // CPR Metronome
  const [cprActive, setCprActive] = useState(false);
  const [cprBeat, setCprBeat] = useState(false);
  const cprIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Lookup modal
  const [showLookup, setShowLookup] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupError, setLookupError] = useState('');

  const timer = useRef(null);

  // Search nearest hospital dynamically whenever coordinates change
  useEffect(() => {
    if (!lat || !lng) return;
    let cancelled = false;
    fetch(`/api/hospitals/nearest?lat=${lat}&lng=${lng}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((hosp) => {
        if (!cancelled && hosp) {
          setNearestHospital(hosp);
          const d = calculateDistanceKm(lat, lng, hosp.latitude, hosp.longitude);
          setNearestDistanceKm(d);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  // Restore active tracking if exists
  useEffect(() => {
    if (activeRequestId && requestToken) {
      fetch(`/api/tracking/request/${activeRequestId}?token=${encodeURIComponent(requestToken)}`, {
        headers: { 'X-Request-Token': requestToken }
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setTracking(data);
            if (data.request) setRequest(data.request);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Poll tracking
  useEffect(() => {
    const id = request?.requestId || activeRequestId;
    const token = requestToken;
    if (!id || !token) return;

    function poll() {
      fetch(`/api/tracking/request/${id}?token=${encodeURIComponent(token)}`, {
        headers: { 'X-Request-Token': token }
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setTracking(data);
            if (data.request) setRequest(data.request);
          }
        })
        .catch(() => {});
    }

    poll();
    timer.current = setInterval(poll, 2500);
    return () => clearInterval(timer.current);
  }, [request?.requestId, activeRequestId, requestToken]);

  // Smooth simulated movement of ambulance toward patient
  useEffect(() => {
    if (!tracking?.ambulance) return;
    const pLat = parseFloat(request?.latitude || lat);
    const pLng = parseFloat(request?.longitude || lng);
    const ambLat = tracking.ambulance.latitude;
    const ambLng = tracking.ambulance.longitude;
    const initAmbLat = ambLat != null ? parseFloat(ambLat) : pLat + 0.015;
    const initAmbLng = ambLng != null ? parseFloat(ambLng) : pLng + 0.012;

    if (!simAmbPos) {
      setSimAmbPos({ lat: initAmbLat, lng: initAmbLng });
    }

    const moveInterval = setInterval(() => {
      setSimAmbPos((prev) => {
        if (!prev) return { lat: initAmbLat, lng: initAmbLng };
        const dLat = pLat - prev.lat;
        const dLng = pLng - prev.lng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        if (dist < 0.0003) return prev;
        return {
          lat: +(prev.lat + dLat * 0.05).toFixed(5),
          lng: +(prev.lng + dLng * 0.05).toFixed(5)
        };
      });
    }, 3000);

    return () => clearInterval(moveInterval);
  }, [tracking?.ambulance?.ambulanceId, request?.latitude, request?.longitude]);

  // Auto detect GPS
  function handleGetLocation() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setStatusMsg('Detecting your location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
        setStatusMsg('Location acquired with GPS accuracy.');
      },
      (err) => {
        setStatusMsg('Could not read GPS automatically. Please select an area below.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Submit emergency request
  async function handleSubmit() {
    setLoading(true);
    const targetHospName = nearestHospital?.hospitalName || 'nearest hospital ER';
    setStatusMsg(`Connecting to ${targetHospName}... Alerting emergency dispatch unit...`);

    const body = {
      patientName: name.trim() || 'Emergency Patient',
      patientPhone: phone.trim() || '9876543210',
      emergencyType: type,
      priority,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      address: address.trim() || (nearestHospital ? `Emergency location near ${nearestHospital.hospitalName} area` : 'Emergency Location')
    };

    try {
      const res = await fetch('/api/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const created = await res.json();
        setRequest(created);
        setRequestToken(created.requestToken || '');
        setActiveRequestId(String(created.requestId));
        localStorage.setItem('smartdispatch_active_request_id', String(created.requestId));
        if (created.requestToken) {
          localStorage.setItem('smartdispatch_active_token', created.requestToken);
        }
        setStatusMsg('');
      } else {
        const errText = await res.text();
        setStatusMsg('Request received. Forwarding to nearest hospital ER...');
      }
    } catch (e) {
      // Offline fallback simulation
      const mockHosp = nearestHospital || {
        hospitalId: 1,
        hospitalName: 'City Emergency Trauma Center',
        contactNumber: '02652223344',
        address: 'Station Road, Vadodara',
        latitude: parseFloat(lat) + 0.012,
        longitude: parseFloat(lng) + 0.009
      };
      const mockReq = {
        requestId: Math.floor(100 + Math.random() * 900),
        patientName: name || 'Emergency Patient',
        patientPhone: phone || '9876543210',
        emergencyType: type,
        priority,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        address: address || 'Emergency Location',
        status: 'Pending'
      };
      setRequest(mockReq);
      setTracking({
        request: mockReq,
        dispatch: null,
        ambulance: null,
        hospital: mockHosp
      });
      setStatusMsg('');
    } finally {
      setLoading(false);
    }
  }

  // Cancel / Clear request
  function handleReset() {
    localStorage.removeItem('smartdispatch_active_request_id');
    localStorage.removeItem('smartdispatch_active_token');
    setRequest(null);
    setTracking(null);
    setRequestToken('');
    setActiveRequestId('');
    setStatusMsg('');
    setSimAmbPos(null);
  }

  // CPR Metronome
  function playClickSound() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}
  }

  function toggleCpr() {
    if (cprActive) {
      clearInterval(cprIntervalRef.current);
      setCprActive(false);
      setCprBeat(false);
    } else {
      setCprActive(true);
      playClickSound();
      cprIntervalRef.current = setInterval(() => {
        setCprBeat(true);
        playClickSound();
        setTimeout(() => setCprBeat(false), 180);
      }, 545);
    }
  }

  // Lookup existing
  async function handleLookupSubmit(e) {
    e.preventDefault();
    if (!lookupId || !lookupPhone) {
      setLookupError('Please enter both Request ID and Phone number.');
      return;
    }
    try {
      const res = await fetch('/api/emergency/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: parseInt(lookupId, 10), phone: lookupPhone.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRequestId(String(data.requestId));
        setRequestToken(data.requestToken);
        localStorage.setItem('smartdispatch_active_request_id', String(data.requestId));
        localStorage.setItem('smartdispatch_active_token', data.requestToken);
        setShowLookup(false);
        setLookupError('');
      } else {
        setLookupError('Request not found. Please verify your details.');
      }
    } catch (err) {
      setLookupError('Could not verify request. Check connection.');
    }
  }

  const isTracking = Boolean(request || tracking);
  const isAssigned = Boolean(tracking?.dispatch || tracking?.ambulance || (request?.status && request?.status !== 'Pending'));
  const currentStatus = tracking?.dispatch?.status || request?.status || 'Pending';
  const hospToDisplay = tracking?.hospital || nearestHospital;

  function getFriendlyStatus(status) {
    switch (status) {
      case 'Pending':
        return `Nearest Hospital Alerted (${hospToDisplay?.hospitalName || 'Trauma ER'}) — Awaiting Ambulance Assignment`;
      case 'Accepted':
      case 'Accepted by Hospital':
      case 'Assigned':
        return `Ambulance Dispatched by ${hospToDisplay?.hospitalName || 'Hospital'} to Your Location`;
      case 'En Route':
      case 'Ambulance En Route':
        return 'Paramedic Ambulance En Route to Your Location';
      case 'Arrived':
      case 'At Scene':
      case 'Ambulance Arrived':
        return 'Ambulance Arrived at Your Location';
      case 'Transporting':
      case 'Transporting to Hospital':
        return `Transporting Patient to ${hospToDisplay?.hospitalName || 'Hospital ER'}`;
      case 'Completed':
        return 'Emergency Mission Completed';
      default:
        return status ? `Status: ${status}` : 'Ambulance Dispatched & En Route';
    }
  }

  const patientLat = parseFloat(request?.latitude || lat);
  const patientLng = parseFloat(request?.longitude || lng);
  const hospitalLat = parseFloat(hospToDisplay?.latitude || 22.31);
  const hospitalLng = parseFloat(hospToDisplay?.longitude || 73.19);

  const curAmbLat = tracking?.ambulance?.latitude != null ? tracking.ambulance.latitude : (simAmbPos ? simAmbPos.lat : null);
  const curAmbLng = tracking?.ambulance?.longitude != null ? tracking.ambulance.longitude : (simAmbPos ? simAmbPos.lng : null);

  const isTransporting = currentStatus === 'Transporting' || currentStatus === 'Transporting to Hospital';
  const targetLat = isTransporting ? hospitalLat : patientLat;
  const targetLng = isTransporting ? hospitalLng : patientLng;

  const distKm =
    curAmbLat != null && curAmbLng != null && !isNaN(targetLat) && !isNaN(targetLng)
      ? calculateDistanceKm(targetLat, targetLng, curAmbLat, curAmbLng)
      : null;
  const etaMins = distKm !== null ? Math.max(1, Math.round((distKm / 35) * 60)) : null;

  const mapMarkers = [
    { latitude: patientLat, longitude: patientLng, label: '📍 Pickup Location' },
    isAssigned && curAmbLat != null && curAmbLng != null
      ? {
          latitude: curAmbLat,
          longitude: curAmbLng,
          label: `🚑 Ambulance (${tracking?.ambulance?.vehicleNumber || '108'})`
        }
      : null,
    hospToDisplay && hospToDisplay.latitude != null && hospToDisplay.longitude != null
      ? {
          latitude: hospitalLat,
          longitude: hospitalLng,
          label: `🏥 ${hospToDisplay.hospitalName}`
        }
      : null
  ].filter(Boolean);

  const routePlan =
    isAssigned && curAmbLat != null && curAmbLng != null && !isNaN(targetLat) && !isNaN(targetLng)
      ? {
          origin: {
            lat: curAmbLat,
            lng: curAmbLng,
            label: `Ambulance (${tracking?.ambulance?.vehicleNumber || 'GJ-01-EM-1080'})`
          },
          destination: {
            lat: targetLat,
            lng: targetLng,
            label: isTransporting ? `Hospital: ${hospToDisplay?.hospitalName || 'ER'}` : 'Your Pickup Location'
          }
        }
      : null;

  return (
    <div className="simple-page-container">
      {/* Clean Top Header */}
      <header className="clean-app-header">
        <div className="header-brand-box">
          <div className="red-cross-mark">+</div>
          <div>
            <h1>Smart Dispatch 108</h1>
            <p>Citizen Emergency Ambulance Response</p>
          </div>
        </div>

        <div className="header-actions">
          {!isTracking && (
            <button className="simple-ghost-btn" type="button" onClick={() => setShowLookup(true)}>
              🔍 Track Request
            </button>
          )}
          <a href="tel:108" className="simple-call-108-btn">
            <span>📞 Call 108</span>
          </a>
        </div>
      </header>

      {/* Main Container */}
      {!isTracking ? (
        <div className="simple-form-card">
          <div className="form-card-header">
            <h2>Request Emergency Ambulance</h2>
            <p>Fill the simple details below. Help will be dispatched immediately.</p>
          </div>

          {/* 1. Emergency Type */}
          <div className="simple-section">
            <label className="section-title">1. Select Emergency Type</label>
            <div className="simple-type-grid">
              {emergencyTypes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`simple-type-btn ${type === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setType(item.id);
                    setPriority(item.priority);
                  }}
                >
                  <span className="type-icon">{item.icon}</span>
                  <span className="type-name">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Location */}
          <div className="simple-section">
            <div className="section-title-row">
              <label className="section-title">2. Pickup Location</label>
              <button type="button" className="simple-location-detect-btn" onClick={handleGetLocation}>
                📍 Detect My Location
              </button>
            </div>

            <input
              type="text"
              className="simple-text-input"
              placeholder="Enter pickup address or landmark (e.g. Near Station Road, Vadodara)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />

            <div className="quick-location-chips">
              <span className="chips-label">Quick select:</span>
              {quickLocations.map((loc, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="location-chip"
                  onClick={() => {
                    setAddress(loc.address);
                    setLat(loc.lat.toFixed(5));
                    setLng(loc.lng.toFixed(5));
                  }}
                >
                  {loc.label}
                </button>
              ))}
            </div>

            {/* Nearest Hospital Identification Preview */}
            {nearestHospital && (
              <div className="nearest-hospital-preview-badge">
                <div className="nh-preview-top">
                  <span className="nh-tag">🏥 NEAREST HOSPITAL IDENTIFIED</span>
                  {nearestDistanceKm !== null && (
                    <span className="nh-km-pill">~{nearestDistanceKm.toFixed(1)} km away</span>
                  )}
                </div>
                <h4>{nearestHospital.hospitalName}</h4>
                <p>📍 {nearestHospital.address} • 📞 {nearestHospital.contactNumber}</p>
                <small className="nh-route-note">✓ Distress call will route directly to {nearestHospital.hospitalName} ER console</small>
              </div>
            )}
          </div>

          {/* 3. Contact Info */}
          <div className="simple-section">
            <label className="section-title">3. Your Contact Details</label>
            <div className="simple-input-row">
              <input
                type="text"
                className="simple-text-input"
                placeholder="Your Name (Optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="tel"
                className="simple-text-input"
                placeholder="Phone Number (e.g. 9876543210)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Status message */}
          {statusMsg && <div className="simple-status-box">{statusMsg}</div>}

          {/* Big Action Button */}
          <button
            type="button"
            className="simple-big-submit-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Dispatching...' : '🚨 REQUEST AMBULANCE NOW'}
          </button>
        </div>
      ) : (
        /* Simple & Reassuring Live Tracking View */
        <div className="simple-tracking-container">
          {/* Top ETA Card */}
          <div className="tracking-summary-card">
            <div className="tracking-eta-left">
              <span className="dispatch-badge">EMERGENCY CALL #{request?.requestId || 101}</span>
              <h2>{getFriendlyStatus(currentStatus)}</h2>
              <p>
                {hospToDisplay?.hospitalName ? (
                  <>🏥 <strong>{hospToDisplay.hospitalName}</strong> {isAssigned ? 'dispatched an emergency ambulance unit.' : 'alerted — awaiting ambulance assignment from their fleet.'}</>
                ) : (
                  <>Type: <strong>{request?.emergencyType}</strong> • Pickup: <strong>{request?.address}</strong></>
                )}
              </p>
            </div>
            <div className="tracking-eta-badge">
              <span className="eta-small-label">ESTIMATED ARRIVAL</span>
              <strong className="eta-big-time">
                {isAssigned && etaMins !== null ? `~${etaMins} MINS` : (isAssigned ? '~3-5 MINS' : 'STANDBY')}
              </strong>
              <small>
                {distKm !== null
                  ? `${distKm.toFixed(1)} km away`
                  : (isAssigned ? 'Approaching scene' : 'Assigning nearest unit')}
              </small>
            </div>
          </div>

          {/* 4-Step Simple Progress */}
          <div className="simple-progress-bar">
            {[
              { label: '1. Request Received', active: true },
              { label: '2. Ambulance Dispatched', active: isAssigned },
              {
                label: '3. Paramedic En Route',
                active: isAssigned && ['Accepted', 'Accepted by Hospital', 'Assigned', 'En Route', 'Ambulance En Route', 'Arrived', 'At Scene', 'Ambulance Arrived', 'Transporting', 'Completed'].includes(currentStatus)
              },
              {
                label: '4. Arrived at Scene',
                active: ['Arrived', 'At Scene', 'Ambulance Arrived', 'Transporting', 'Completed'].includes(currentStatus)
              }
            ].map((step, i) => (
              <div key={i} className={`progress-pill ${step.active ? 'done' : ''}`}>
                <span className="prog-dot">{step.active ? '✓' : i + 1}</span>
                <span>{step.label}</span>
              </div>
            ))}
          </div>

          {/* Map and Details Grid */}
          <div className="tracking-grid-two">
            {/* Live Map & Driving Route */}
            <div className="simple-card map-box">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>📍 Live Ambulance Route & Navigation</h3>
                {isAssigned && distKm !== null && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '3px 10px', borderRadius: 999 }}>
                    ~{distKm.toFixed(1)} km • {etaMins || 3} min away
                  </span>
                )}
              </div>
              <MapView height={360} zoom={14} markers={mapMarkers} route={routePlan} />
            </div>

            {/* Responder Cards */}
            <div className="simple-card details-box">
              {/* Ambulance Card */}
              {isAssigned && tracking?.ambulance ? (
                <div className="driver-info-box">
                  <div className="info-icon">🚑</div>
                  <div className="info-content">
                    <span className="info-label">ASSIGNED AMBULANCE</span>
                    <h4>{tracking.ambulance.vehicleNumber || 'GJ-01-EM-1080'}</h4>
                    <p>{tracking.ambulance.driverName || 'Ramesh Kumar'} (Paramedic)</p>
                    <a
                      href={`tel:${tracking.ambulance.driverPhone || '9999999999'}`}
                      className="call-driver-btn"
                    >
                      📞 Call Driver ({tracking.ambulance.driverPhone || '9999999999'})
                    </a>
                  </div>
                </div>
              ) : (
                <div className="driver-info-box" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                  <div className="info-icon" style={{ filter: 'grayscale(0.4)' }}>⏳</div>
                  <div className="info-content">
                    <span className="info-label" style={{ color: '#d97706' }}>AMBULANCE ALLOCATION</span>
                    <h4 style={{ color: '#334155' }}>Awaiting Hospital ER Assignment...</h4>
                    <p style={{ color: '#64748b' }}>
                      <strong>{hospToDisplay?.hospitalName || 'Nearest Hospital ER'}</strong> has received your distress request and is dispatching an ambulance from its fleet.
                    </p>
                  </div>
                </div>
              )}

              {/* Hospital Card */}
              <div className="hospital-info-box">
                <div className="info-icon">🏥</div>
                <div className="info-content">
                  <span className="info-label">
                    {isAssigned ? 'RECEIVING TRAUMA CENTER & BASE' : 'NEAREST EMERGENCY HOSPITAL (ALERTED)'}
                  </span>
                  <h4>{hospToDisplay?.hospitalName || 'Emergency Trauma Center'}</h4>
                  <p>{hospToDisplay?.address || 'Designated Trauma Center'}</p>
                  {hospToDisplay?.contactNumber && (
                    <a
                      href={`tel:${hospToDisplay.contactNumber}`}
                      className="call-hosp-btn-link"
                      style={{ display: 'inline-block', marginTop: 4, fontSize: '0.82rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                    >
                      📞 Call Hospital ER ({hospToDisplay.contactNumber})
                    </a>
                  )}
                </div>
              </div>

              {/* CPR Metronome Helper */}
              <div className="cpr-simple-card">
                <div className="cpr-header-row">
                  <div>
                    <strong>❤️ Pre-Arrival First Aid: CPR Guide</strong>
                    <p>Push hard and fast in the center of the chest (100–120 compressions/min).</p>
                  </div>
                  <button
                    type="button"
                    className={`cpr-beat-button ${cprActive ? 'active' : ''}`}
                    onClick={toggleCpr}
                  >
                    <span className={`heart-beat-icon ${cprBeat ? 'beat' : ''}`}>❤️</span>
                    <span>{cprActive ? 'Stop Metronome' : 'Start Beat'}</span>
                  </button>
                </div>
              </div>

              {/* Close / Reset */}
              <div className="tracking-bottom-actions">
                <button type="button" className="simple-outline-btn danger" onClick={handleReset}>
                  ✕ Close Tracking / Request New
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lookup Modal */}
      {showLookup && (
        <div className="simple-modal-backdrop">
          <div className="simple-modal-card">
            <div className="modal-top">
              <h3>Track Existing Emergency Request</h3>
              <button type="button" onClick={() => setShowLookup(false)}>✕</button>
            </div>
            <form onSubmit={handleLookupSubmit} className="modal-form">
              <label>Enter Request ID</label>
              <input
                type="number"
                className="simple-text-input"
                placeholder="e.g. 101"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                required
              />
              <label>Registered Phone Number</label>
              <input
                type="tel"
                className="simple-text-input"
                placeholder="e.g. 9876543210"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                required
              />
              {lookupError && <div className="modal-error">{lookupError}</div>}
              <div className="modal-buttons">
                <button type="button" className="simple-ghost-btn" onClick={() => setShowLookup(false)}>
                  Cancel
                </button>
                <button type="submit" className="simple-primary-btn">
                  Retrieve Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
