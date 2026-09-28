import React, { useEffect, useRef, useState } from 'react';
import MapView from './MapView';

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const pLat1 = parseFloat(lat1);
  const pLon1 = parseFloat(lon1);
  const pLat2 = parseFloat(lat2);
  const pLon2 = parseFloat(lon2);
  if (isNaN(pLat1) || isNaN(pLon1) || isNaN(pLat2) || isNaN(pLon2)) return null;
  const R = 6371; // Earth radius in km
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

export default function Emergency() {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('Accident');
  const [priority, setPriority] = useState('Critical');
  const [status, setStatus] = useState('');
  const [request, setRequest] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [requestToken, setRequestToken] = useState(() => localStorage.getItem('smartdispatch_active_token') || '');
  const [activeRequestId, setActiveRequestId] = useState(() => localStorage.getItem('smartdispatch_active_request_id') || '');
  const [isRestoring, setIsRestoring] = useState(Boolean(localStorage.getItem('smartdispatch_active_request_id') && localStorage.getItem('smartdispatch_active_token')));
  const [showLookup, setShowLookup] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupStatus, setLookupStatus] = useState('');
  const [showHelpChat, setShowHelpChat] = useState(false);
  const [chatMode, setChatMode] = useState('AI Assistant');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'assistant', text: 'Hello. I can help with emergency requests, tracking, and first steps while help is dispatched.' }
  ]);

  const timer = useRef(null);

  function getLocation() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
      },
      (err) => alert('Unable to get location: ' + err.message),
      { enableHighAccuracy: true }
    );
  }

  function fillDemoEmergency() {
    setName('Kavita Sharma');
    setPhone('9876543210');
    setType('Accident');
    setPriority('Critical');
    if (!lat || !lng) {
      setLat('22.30720');
      setLng('73.18120');
    }
    setStatus('Demo incident populated. Ready to request ambulance.');
  }

  function sendChatMessage(event) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;

    const reply = chatMode === 'AI Assistant'
      ? 'Please share your emergency type and location, then use Request Ambulance. In an immediate life-threatening situation, call 108.'
      : 'Your message is ready for the dispatch admin. Please include your request ID or phone number so they can assist quickly.';

    setChatMessages((current) => [
      ...current,
      { sender: 'user', text: message },
      { sender: 'assistant', text: reply }
    ]);
    setChatInput('');
  }

  // Restore saved active session from localStorage on initial render
  useEffect(() => {
    if (activeRequestId && requestToken) {
      async function restoreSession() {
        try {
          const res = await fetch(`/api/tracking/request/${activeRequestId}`, {
            headers: { 'X-Request-Token': requestToken }
          });
          if (res.ok) {
            const data = await res.json();
            setTracking(data);
            if (data.request) {
              setRequest(data.request);
            }
          } else if (res.status === 401 || res.status === 403 || res.status === 404) {
            // Token expired or invalid
            clearActiveRequest();
          }
        } catch (e) {
          console.error('Failed to restore tracking session', e);
        } finally {
          setIsRestoring(false);
        }
      }
      restoreSession();
    } else {
      setIsRestoring(false);
    }
  }, []);

  async function submitRequest() {
    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
      setStatus('Please share your GPS location before requesting an ambulance.');
      return;
    }

    const body = {
      patientName: name.trim() || 'Patient in Need',
      patientPhone: phone.trim(),
      emergencyType: type,
      priority,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      address: ''
    };

    setStatus('Submitting emergency request...');

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

        // Save session locally so user can refresh phone without losing tracking
        localStorage.setItem('smartdispatch_active_request_id', String(created.requestId));
        if (created.requestToken) {
          localStorage.setItem('smartdispatch_active_token', created.requestToken);
        }

        setStatus('Emergency request received. Finding nearest hospital and ambulance...');
      } else {
        const text = await res.text();
        setStatus('Failed to submit the emergency request: ' + text);
      }
    } catch (e) {
      setStatus('Network error. Please call emergency services immediately.');
    }
  }

  // Poll tracking data securely using the requester's token
  useEffect(() => {
    const idToTrack = request?.requestId || activeRequestId;
    const tokenToUse = requestToken;

    if (!idToTrack || !tokenToUse) return undefined;

    async function loadTracking() {
      try {
        const response = await fetch(`/api/tracking/request/${idToTrack}`, {
          headers: { 'X-Request-Token': tokenToUse }
        });
        if (response.ok) {
          const data = await response.json();
          setTracking(data);
          if (data.request) setRequest(data.request);
        }
      } catch (err) {
        console.error('Tracking fetch error', err);
      }
    }

    loadTracking();
    timer.current = setInterval(loadTracking, 4000);
    return () => clearInterval(timer.current);
  }, [request?.requestId, activeRequestId, requestToken]);

  async function handleLookup() {
    if (!lookupId || !lookupPhone) {
      setLookupStatus('Please enter both your Request ID and Phone Number.');
      return;
    }
    setLookupStatus('Verifying your emergency request...');
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
        setLookupStatus('');
      } else {
        setLookupStatus('Request not found or phone number does not match.');
      }
    } catch (e) {
      setLookupStatus('Network error while searching for request.');
    }
  }

  function clearActiveRequest() {
    localStorage.removeItem('smartdispatch_active_request_id');
    localStorage.removeItem('smartdispatch_active_token');
    setRequest(null);
    setTracking(null);
    setRequestToken('');
    setActiveRequestId('');
    setIsRestoring(false);
    setStatus('');
  }

  // Calculate live distance and ETA to patient
  const activeReq = request || tracking?.request;
  const patientLat = activeReq?.latitude;
  const patientLng = activeReq?.longitude;
  const ambLat = tracking?.ambulance?.latitude;
  const ambLng = tracking?.ambulance?.longitude;

  const distanceKm = calculateDistanceKm(patientLat, patientLng, ambLat, ambLng);
  const etaMinutes = distanceKm !== null ? Math.max(1, Math.round((distanceKm / 35) * 60)) : null;

  const trackingMarkers = [
    patientLat != null && patientLng != null && !isNaN(parseFloat(patientLat)) && !isNaN(parseFloat(patientLng)) && {
      latitude: parseFloat(patientLat),
      longitude: parseFloat(patientLng),
      label: '📍 Your Location'
    },
    ambLat != null && ambLng != null && !isNaN(parseFloat(ambLat)) && !isNaN(parseFloat(ambLng)) && {
      latitude: parseFloat(ambLat),
      longitude: parseFloat(ambLng),
      label: `🚑 Ambulance ${tracking?.ambulance?.vehicleNumber || ''}`
    },
    tracking?.hospital?.latitude != null && tracking?.hospital?.longitude != null && !isNaN(parseFloat(tracking.hospital.latitude)) && !isNaN(parseFloat(tracking.hospital.longitude)) && {
      latitude: parseFloat(tracking.hospital.latitude),
      longitude: parseFloat(tracking.hospital.longitude),
      label: `🏥 ${tracking.hospital.hospitalName}`
    }
  ].filter(Boolean);

  const dispatchStatus = tracking?.dispatch?.status || activeReq?.status || 'Pending';

  // Determine active step index
  let stepIndex = 0;
  if (dispatchStatus === 'Pending') stepIndex = 0;
  else if (dispatchStatus === 'Accepted' || dispatchStatus === 'Assigned') stepIndex = 1;
  else if (dispatchStatus === 'En Route' || dispatchStatus === 'Ambulance En Route') stepIndex = 2;
  else if (dispatchStatus === 'Arrived' || dispatchStatus === 'Ambulance Arrived' || dispatchStatus === 'At Scene') stepIndex = 3;
  else if (dispatchStatus === 'Transporting' || dispatchStatus === 'Transporting to Hospital') stepIndex = 4;
  else if (dispatchStatus === 'Completed') stepIndex = 5;

  return (
    <div className="emergency-container">
      {/* If restoring session, show clean loading state */}
      {isRestoring ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🚑</div>
          <h3 style={{ margin: '0 0 6px', color: '#0f172a' }}>Loading Active Emergency Session...</h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Connecting to live dispatch stream</p>
        </div>
      ) : activeReq || tracking ? (
        <div className="requester-tracking-view">
          {/* Top Banner */}
          <div className="tracking-header-banner">
            <div className="tracking-title-area">
              <div className="live-badge">
                <span className="live-dot" />
                LIVE AMBULANCE TRACKING
              </div>
              <h2>Emergency Help is on the Way</h2>
              <p className="tracking-meta-line">
                Request <strong>#{activeReq?.requestId || activeRequestId}</strong> • Patient: <strong>{activeReq?.patientName || 'Patient'}</strong> • Incident: <strong>{activeReq?.emergencyType || 'Accident'}</strong>
              </p>
            </div>
            <div className="tracking-header-actions">
              <button className="ghost-btn danger" onClick={clearActiveRequest} type="button">
                Start New Request
              </button>
            </div>
          </div>

          {/* Privacy & Security Reassurance */}
          <div className="private-session-banner">
            <span>🔒 <strong>Private Live Session:</strong> This live ambulance GPS stream is securely bound to your verified request token.</span>
          </div>

          {/* Live ETA & Distance Card */}
          {tracking?.ambulance && ambLat && ambLng ? (
            <div className="eta-highlight-card">
              <div className="eta-main">
                <div className="eta-icon">🚑</div>
                <div>
                  <div className="eta-time">
                    {dispatchStatus === 'Arrived' || dispatchStatus === 'At Scene'
                      ? 'Ambulance Arrived at Your Location'
                      : dispatchStatus === 'Transporting' || dispatchStatus === 'Transporting to Hospital'
                      ? 'En Route to Hospital'
                      : dispatchStatus === 'Completed'
                      ? 'Trip Safely Completed'
                      : `Estimated Arrival: ~${etaMinutes} min${etaMinutes > 1 ? 's' : ''}`}
                  </div>
                  <div className="eta-distance">
                    {dispatchStatus === 'Arrived' || dispatchStatus === 'At Scene'
                      ? 'Driver has reached the pickup scene'
                      : `Ambulance is ${distanceKm < 1 ? Math.round(distanceKm * 1000) + ' meters' : distanceKm.toFixed(1) + ' km'} away from your pickup point`}
                  </div>
                </div>
              </div>
              <div className="eta-radar">
                <span className="radar-circle" />
                <span className="radar-text">Live GPS Updating</span>
              </div>
            </div>
          ) : (
            <div className="eta-highlight-card searching">
              <div className="eta-main">
                <div className="eta-icon pulse">🏥</div>
                <div>
                  <div className="eta-time">Searching for Nearest Hospital & Ambulance...</div>
                  <div className="eta-distance">Your critical request has been broadcasted to available emergency centers.</div>
                </div>
              </div>
            </div>
          )}

          {/* Stepper Timeline */}
          <div className="tracking-stepper-card">
            <h4>Live Mission Progress</h4>
            <div className="stepper-bar">
              {[
                { title: 'Request Sent', sub: 'Logged with dispatch' },
                { title: 'Hospital Accepted', sub: 'Ambulance assigned' },
                { title: 'Ambulance En Route', sub: 'Live GPS active' },
                { title: 'Arrived at Scene', sub: 'Assisting patient' },
                { title: 'Transporting', sub: 'En route to hospital' },
                { title: 'Completed', sub: 'Patient admitted' }
              ].map((step, idx) => {
                const isPassed = stepIndex >= idx;
                const isCurrent = stepIndex === idx;
                return (
                  <div key={idx} className={`stepper-item ${isPassed ? 'passed' : ''} ${isCurrent ? 'current' : ''}`}>
                    <div className="stepper-node">{isPassed ? (idx < stepIndex ? '✓' : '●') : idx + 1}</div>
                    <div className="stepper-info">
                      <strong>{step.title}</strong>
                      <small>{step.sub}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tracking-details-grid">
            {/* Live Map Panel */}
            <div className="tracking-map-panel">
              <div className="card-subhead">
                <h3>📍 Live Map Route</h3>
                {ambLat && ambLng && (
                  <span className="live-tag">Ambulance in Motion</span>
                )}
              </div>
              <MapView markers={trackingMarkers} height={400} />
            </div>

            {/* Emergency Contacts & Details Panel */}
            <div className="tracking-info-sidebar">
              {/* Driver & Ambulance Card */}
              {tracking?.ambulance && (
                <div className="driver-contact-card">
                  <div className="driver-contact-header">
                    <span className="eyebrow">ASSIGNED AMBULANCE</span>
                    <h4>Ambulance {tracking.ambulance.vehicleNumber}</h4>
                    <span className="vehicle-type-tag">{tracking.ambulance.type || 'Emergency Support'}</span>
                  </div>

                  <div className="driver-contact-details">
                    <div>
                      <strong>Driver Name</strong>
                      <span>{tracking.ambulance.driverName || 'Emergency Driver'}</span>
                    </div>
                    {tracking.ambulance.driverPhone && (
                      <div className="contact-action-box">
                        <a href={`tel:${tracking.ambulance.driverPhone}`} className="primary-call-btn">
                          📞 Call Driver ({tracking.ambulance.driverPhone})
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Receiving Hospital Card */}
              {tracking?.hospital && (
                <div className="hospital-contact-card">
                  <span className="eyebrow">DESTINATION HOSPITAL</span>
                  <h4>{tracking.hospital.hospitalName}</h4>
                  <p>{tracking.hospital.address}</p>
                  {tracking.hospital.contactNumber && (
                    <a href={`tel:${tracking.hospital.contactNumber}`} className="secondary-call-btn">
                      📞 Call Hospital ({tracking.hospital.contactNumber})
                    </a>
                  )}
                </div>
              )}

              {/* Immediate 108 Emergency Call */}
              <div className="emergency-hotline-card">
                <span>In extreme critical condition:</span>
                <a href="tel:108" className="hotline-btn">
                  🚨 Call National Helpline 108
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* New Request Form */
        <div className="emergency-grid">
          <section className="card emergency-hero">
            <div className="hero-badge">EMERGENCY RESPONSE</div>
            <h2>Need urgent help?</h2>
            <p>
              Report your incident instantly and dispatch the nearest available emergency ambulance with real-time GPS tracking.
            </p>

            <div className="quick-actions">
              <button className="primary-btn pulse-glow" onClick={submitRequest} type="button">
                🚨 Request Ambulance
              </button>
              <button className="ghost-btn demo-fill-btn" onClick={fillDemoEmergency} type="button">
                ⚡ Fill Demo Incident
              </button>
              <button
                className="secondary-btn"
                onClick={() => setShowHelpChat(true)}
                type="button"
              >
                💬 Chat for Help
              </button>
            </div>

            {showHelpChat && (
              <div className="help-chat-panel">
                <div className="help-chat-header">
                  <div>
                    <span className="eyebrow">IN-APP SUPPORT</span>
                    <h3>Chat for Help</h3>
                  </div>
                  <button className="chat-close-btn" onClick={() => setShowHelpChat(false)} type="button" aria-label="Close help chat">
                    ×
                  </button>
                </div>
                <div className="chat-recipient-toggle" role="tablist" aria-label="Choose chat recipient">
                  {['AI Assistant', 'Dispatch Admin'].map((recipient) => (
                    <button
                      key={recipient}
                      className={chatMode === recipient ? 'active' : ''}
                      onClick={() => setChatMode(recipient)}
                      type="button"
                    >
                      {recipient === 'AI Assistant' ? '✨' : '🛟'} {recipient}
                    </button>
                  ))}
                </div>
                <div className="chat-messages" aria-live="polite">
                  {chatMessages.map((message, index) => (
                    <div key={`${message.sender}-${index}`} className={`chat-message ${message.sender}`}>
                      {message.text}
                    </div>
                  ))}
                </div>
                <form className="chat-compose" onSubmit={sendChatMessage}>
                  <input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder={`Message ${chatMode.toLowerCase()}`}
                    aria-label={`Message ${chatMode}`}
                  />
                  <button className="primary-btn" type="submit">Send</button>
                </form>
              </div>
            )}

            <div className="existing-lookup-link">
              <button
                className="text-link-btn"
                onClick={() => setShowLookup(!showLookup)}
                type="button"
              >
                {showLookup ? 'Hide Request Lookup' : '🔍 Already requested an ambulance? Track it here'}
              </button>
            </div>

            {showLookup && (
              <div className="lookup-box">
                <h4>Track Your Active Request</h4>
                <p>Enter your Request ID and the contact phone number used when submitting:</p>
                <div className="lookup-fields">
                  <input
                    type="number"
                    placeholder="Request ID (e.g. 1)"
                    value={lookupId}
                    onChange={(e) => setLookupId(e.target.value)}
                  />
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={lookupPhone}
                    onChange={(e) => setLookupPhone(e.target.value)}
                  />
                  <button className="secondary-btn" onClick={handleLookup} type="button">
                    Track Ambulance
                  </button>
                </div>
                {lookupStatus && <div className="lookup-status">{lookupStatus}</div>}
              </div>
            )}
          </section>

          <section className="card form-card">
            <div className="field-grid">
              <div className="field">
                <label>Emergency Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option>Accident</option>
                  <option>Medical</option>
                  <option>Fire</option>
                  <option>Cardiac</option>
                </select>
              </div>

              <div className="field">
                <label>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option>Critical</option>
                  <option>High</option>
                  <option>Normal</option>
                </select>
              </div>

              <div className="field">
                <label>Patient Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter patient name"
                />
              </div>

              <div className="field">
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter contact number"
                />
              </div>

              <div className="field">
                <label>Location</label>
                <button className="ghost-btn location-btn" onClick={getLocation} type="button">
                  📍 Capture My GPS Location
                </button>
              </div>
            </div>

            <div className="location-box">
              <span>GPS Status</span>
              {lat && lng ? <strong className="location-success">✓ Location captured</strong> : <strong>Waiting for GPS</strong>}
            </div>

            <div className="location-coords">
              <div className="coord-box">
                <strong>Latitude</strong>
                {lat || '—'}
              </div>
              <div className="coord-box">
                <strong>Longitude</strong>
                {lng || '—'}
              </div>
            </div>

            <div className={`status-message ${status && status.toLowerCase().includes('received') ? 'success' : status ? 'error' : ''}`}>
              {status || 'Ready for emergency dispatch'}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
