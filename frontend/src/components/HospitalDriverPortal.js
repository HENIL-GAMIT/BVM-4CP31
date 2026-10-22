import React, { useEffect, useRef, useState } from 'react';
import MapView from './MapView';
import { authHeaders, saveSession, clearSession, getSession } from '../auth';

export default function HospitalDriverPortal({ initialSubTab = 'hospital' }) {
  const [subTab, setSubTab] = useState(initialSubTab); // 'driver' | 'hospital'

  // Driver state
  const [ambulanceId, setAmbulanceId] = useState(() => getSession('Driver')?.ambulanceId || '');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverPassword, setDriverPassword] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverToken, setDriverToken] = useState(() => (initialSubTab === 'driver' ? getSession('Driver')?.token || '' : ''));
  const [driverCoords, setDriverCoords] = useState({ latitude: 22.3150, longitude: 73.1850 });
  const [selectedDispatch, setSelectedDispatch] = useState(null);

  // Vitals
  const [vitals, setVitals] = useState({ heartRate: '108', bloodPressure: '128/84', spo2: '95%' });
  const [vitalsSent, setVitalsSent] = useState(false);
  const [sendingVitals, setSendingVitals] = useState(false);

  // Hospital state
  const [hospitalId, setHospitalId] = useState(() => getSession('Hospital')?.hospitalId || '');
  const [hospPhone, setHospPhone] = useState('');
  const [hospitalPassword, setHospitalPassword] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalToken, setHospitalToken] = useState(() => (initialSubTab === 'hospital' ? getSession('Hospital')?.token || '' : ''));
  const [registeredHospitals, setRegisteredHospitals] = useState([]);
  const [icuAvailable, setIcuAvailable] = useState(2);
  const [traumaBayStatus, setTraumaBayStatus] = useState('Ready');
  const [traumaAlerted, setTraumaAlerted] = useState(false);

  // Active incoming case for hospital ER
  const [activeIncomingEmergency, setActiveIncomingEmergency] = useState(null);

  // Hospital Fleet state (Only hospital can add its ambulances)
  const [hospitalFleet, setHospitalFleet] = useState([]);
  const [showAddAmbModal, setShowAddAmbModal] = useState(false);
  const [newAmbPlate, setNewAmbPlate] = useState('');
  const [newAmbDriver, setNewAmbDriver] = useState('');
  const [newAmbPhone, setNewAmbPhone] = useState('');
  const [newAmbPassword, setNewAmbPassword] = useState('');
  const [newAmbType, setNewAmbType] = useState('Advanced Life Support (ALS)');
  const [ambSuccessMsg, setAmbSuccessMsg] = useState('');

  // Pending emergencies nearest to this hospital (Starts empty - only real requests shown)
  const [pendingEmergencies, setPendingEmergencies] = useState([]);
  const [selectedAmbForDispatch, setSelectedAmbForDispatch] = useState('1');
  const [selectedAmbPerReq, setSelectedAmbPerReq] = useState({});
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [vitalsMessage, setVitalsMessage] = useState('');

  // Fetch registered hospitals on mount
  useEffect(() => {
    fetch('/api/hospitals')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setRegisteredHospitals(data);
          const activeHospId = getSession('Hospital')?.hospitalId;
          if (activeHospId) {
            const current = data.find((h) => String(h.hospitalId) === String(activeHospId));
            if (current) {
              setHospitalName(current.hospitalName);
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  // Tab switching: immediately close session when shifting between hospital and ambulance
  function handleSubTabShift(targetTab) {
    if (targetTab === subTab) return;
    clearSession();
    setHospitalToken('');
    setDriverToken('');
    setSelectedDispatch(null);
    setActiveIncomingEmergency(null);
    setHospitalFleet([]);
    setPendingEmergencies([]);
    setSubTab(targetTab);
  }

  // Complete sign out for hospital
  function handleHospitalSignOut() {
    clearSession();
    setHospitalToken('');
    setHospitalFleet([]);
    setPendingEmergencies([]);
    setActiveIncomingEmergency(null);
  }

  // Audio alert chime for new emergency
  const audioContextRef = useRef(null);
  const lastAlertedIdRef = useRef(null);

  function playAlertChime() {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880.00, now + 0.15); // A5
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {}
  }

  // Real Hospital Login via /api/auth/hospital-login
  async function performHospitalLogin(customPhone, customName, customHospId, customPassword) {
    const targetPhone = (customPhone || hospPhone || '').trim();
    const targetName = (customName || hospitalName || '').trim();
    const password = customPassword ?? hospitalPassword;
    setAuthMessage('');
    if (!targetPhone || !password) {
      setAuthMessage('Enter the registered hospital phone and password.');
      return null;
    }

    try {
      const res = await fetch('/api/auth/hospital-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone, hospitalName: targetName, password })
      });

      if (res.ok) {
        const data = await res.json();
        if (!data.token || data.hospitalId == null) throw new Error('The server returned an incomplete hospital session.');
        saveSession({ token: data.token, role: 'Hospital', hospitalId: data.hospitalId });
        setHospitalToken(data.token);
        setHospitalId(String(data.hospitalId));
        setHospitalPassword('');
        if (customName) setHospitalName(customName);
        if (customPhone) setHospPhone(customPhone);
        setHospitalFleet([]);
        setPendingEmergencies([]);
        setActiveIncomingEmergency(null);
        return data.token;
      }

      const detail = await res.text();
      setAuthMessage(detail || `Hospital login failed (HTTP ${res.status}). Check the hospital phone and name.`);
    } catch (e) {
      console.error('Hospital login error:', e);
      setAuthMessage(e.message || 'Could not connect to the hospital authentication service.');
    }
    return null;
  }

  // Real Driver Login via /api/auth/driver-login
  async function performDriverLogin(customPhone, customPlate, customPassword) {
    const targetPhone = (customPhone || driverPhone || '').trim();
    const targetPlate = (customPlate || vehicleNumber || '').trim().toUpperCase();
    const password = customPassword ?? driverPassword;
    setAuthMessage('');
    if (!targetPhone || !targetPlate || !password) {
      setAuthMessage('Enter the registered phone, vehicle plate, and password.');
      return null;
    }

    try {
      const res = await fetch('/api/auth/driver-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone, vehicleNumber: targetPlate, password })
      });

      if (res.ok) {
        const data = await res.json();
        if (!data.token || data.ambulanceId == null) throw new Error('The server returned an incomplete driver session.');
        saveSession({ token: data.token, role: 'Driver', ambulanceId: data.ambulanceId });
        setDriverToken(data.token);
        setAmbulanceId(String(data.ambulanceId));
        setDriverPassword('');
        return data.token;
      }
      const detail = await res.text();
      setAuthMessage(detail || `Driver login failed (HTTP ${res.status}). Check the phone and vehicle number.`);
    } catch (e) {
      console.error('Driver login error:', e);
      setAuthMessage(e.message || 'Could not connect to the driver authentication service.');
    }
    return null;
  }

  // Load hospital fleet & nearest pending calls
  function loadHospitalData() {
    if (!hospitalId || !hospitalToken) return;
    const headers = authHeaders(hospitalToken);

    // 1. Load this hospital's ambulances ONLY
    fetch(`/api/hospitals/${hospitalId}/ambulances`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const fleet = Array.isArray(data) ? data : [];
        setHospitalFleet(fleet);
        const avail = fleet.find((a) => a.status === 'Available');
        if (avail) {
          setSelectedAmbForDispatch(String(avail.ambulanceId));
        } else if (fleet.length > 0) {
          setSelectedAmbForDispatch(String(fleet[0].ambulanceId));
        } else {
          setSelectedAmbForDispatch('');
        }
      })
      .catch(() => {
        setHospitalFleet([]);
      });

    // 2. Load pending emergencies where THIS hospital is nearest
    fetch(`/api/emergency/available-for-hospital/${hospitalId}`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPendingEmergencies(list);
        const newest = list[0];
        if (newest && newest.requestId !== lastAlertedIdRef.current) {
          lastAlertedIdRef.current = newest.requestId;
          playAlertChime();
        }
      })
      .catch(() => {
        setPendingEmergencies([]);
      });

    // 3. Load active incoming dispatches for THIS hospital
    fetch(`/api/dispatch/hospital/${hospitalId}`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then(async (dispatches) => {
        if (Array.isArray(dispatches)) {
          const active = dispatches.find((d) => d.status !== 'Completed');
          if (active) {
            const [reqRes, vitalsRes, ambRes] = await Promise.all([
              fetch(`/api/emergency/${active.requestId}`, { headers }),
              fetch(`/api/dispatch/${active.dispatchId}/vitals`, { headers }),
              fetch(`/api/ambulances/${active.ambulanceId}`, { headers })
            ]);
            const reqData = reqRes.ok ? await reqRes.json() : null;
            const vitalsData = vitalsRes.ok ? await vitalsRes.json() : null;
            const ambData = ambRes.ok ? await ambRes.json() : null;

            setActiveIncomingEmergency({
              dispatchId: active.dispatchId,
              requestId: active.requestId,
              status: active.status,
              patientName: reqData?.patientName || 'Emergency Patient',
              emergencyType: reqData?.emergencyType || 'Accident / Trauma',
              vehicleNumber: ambData?.vehicleNumber || 'Ambulance Unit',
              driverName: ambData?.driverName || 'Paramedic Driver',
              driverPhone: ambData?.driverPhone || 'Paramedic Contact',
              vitals: vitalsData
            });
          } else {
            setActiveIncomingEmergency(null);
          }
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (subTab === 'hospital') {
      loadHospitalData();
      const interval = setInterval(loadHospitalData, 3500);
      return () => clearInterval(interval);
    }
  }, [subTab, hospitalId, hospitalToken]);

  // Hospital adds an ambulance to its own fleet
  async function handleAddAmbulance(e) {
    e.preventDefault();
    if (!newAmbPlate || !newAmbDriver || !newAmbPhone || !newAmbPassword) {
      alert('Please fill in vehicle plate, driver name, phone number, and a password.');
      return;
    }

    const token = hospitalToken || await performHospitalLogin(hospPhone, hospitalName);
    if (!token) return;

    // Resolve hospital coordinates so ambulance spawns at this hospital
    const curHosp = registeredHospitals.find((h) => String(h.hospitalId) === String(hospitalId));

    const body = {
      hospitalId: Number(hospitalId),
      vehicleNumber: newAmbPlate.trim().toUpperCase(),
      driverName: newAmbDriver.trim(),
      driverPhone: newAmbPhone.trim(),
      password: newAmbPassword,
      type: newAmbType,
      latitude: curHosp?.latitude || 22.31,
      longitude: curHosp?.longitude || 73.19,
      status: 'Available'
    };

    try {
      const res = await fetch('/api/ambulances', {
        method: 'POST',
        headers: {
          ...authHeaders(token),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const created = await res.json();
        setHospitalFleet((prev) => [...prev, created]);
        setSelectedAmbForDispatch(String(created.ambulanceId));
        setNewAmbPassword('');
      } else {
        const detail = await res.text();
        setAmbSuccessMsg(`Could not add ambulance (HTTP ${res.status}): ${detail}`);
        return;
      }
    } catch (err) {
      console.error('Add ambulance error:', err);
      setAmbSuccessMsg('Could not reach the backend. The ambulance was not added.');
      return;
    }

    setAmbSuccessMsg(`✓ Ambulance ${newAmbPlate.toUpperCase()} added to ${hospitalName}'s fleet!`);
    setNewAmbPlate('');
    setNewAmbDriver('');
    setNewAmbPhone('');
    setNewAmbPassword('');
    setShowAddAmbModal(false);
    setTimeout(() => setAmbSuccessMsg(''), 3500);
  }

  // Hospital assigns an ambulance to a nearby emergency
  async function handleAssignAmbulance(reqId) {
    if (!hospitalFleet || hospitalFleet.length === 0) {
      setDispatchSuccessMsg('⚠️ No ambulances available in your hospital fleet. Please add an ambulance first.');
      return;
    }

    const chosenAmbId = Number(selectedAmbPerReq[reqId] || selectedAmbForDispatch) || hospitalFleet[0]?.ambulanceId;
    const chosenAmb = hospitalFleet.find((a) => a.ambulanceId === chosenAmbId) || hospitalFleet[0];

    if (!chosenAmb) {
      setDispatchSuccessMsg('⚠️ Please select a valid ambulance from your fleet.');
      return;
    }

    const token = hospitalToken || await performHospitalLogin(hospPhone, hospitalName);
    if (!token) return;

    try {
      const acceptRes = await fetch(`/api/emergency/${reqId}/accept?hospitalId=${hospitalId}&ambulanceId=${chosenAmb.ambulanceId}`, {
        method: 'POST',
        headers: authHeaders(token)
      });

      if (!acceptRes.ok) {
        const detail = await acceptRes.text();
        setDispatchSuccessMsg(detail || `Could not assign this emergency (HTTP ${acceptRes.status}).`);
        return;
      }
    } catch (err) {
      console.error('Error assigning ambulance:', err);
      setDispatchSuccessMsg('Could not reach the backend. The emergency was not assigned.');
      return;
    }

    // Update UI state immediately
    const assignedReq = pendingEmergencies.find((r) => r.requestId === reqId);
    if (assignedReq) {
      setActiveIncomingEmergency({
        requestId: assignedReq.requestId,
        patientName: assignedReq.patientName,
        emergencyType: assignedReq.emergencyType,
        vehicleNumber: chosenAmb.vehicleNumber,
        driverName: chosenAmb.driverName,
        driverPhone: chosenAmb.driverPhone
      });
    }

    setDispatchSuccessMsg(`✓ Ambulance ${chosenAmb.vehicleNumber} (${chosenAmb.driverName}) assigned and dispatched to Emergency #${reqId}!`);
    setPendingEmergencies((prev) => prev.filter((r) => r.requestId !== reqId));

    setTimeout(() => {
      loadHospitalData();
    }, 400);

    setTimeout(() => setDispatchSuccessMsg(''), 5000);
  }

  // Delete ambulance from fleet
  async function handleRemoveAmbulance(ambId) {
    if (!window.confirm('Are you sure you want to remove this ambulance from your fleet?')) return;
    try {
      await fetch(`/api/ambulances/${ambId}`, {
        method: 'DELETE',
        headers: authHeaders(hospitalToken)
      });
    } catch (e) {}
    setHospitalFleet((prev) => prev.filter((a) => a.ambulanceId !== ambId));
  }

  // Driver polling for active assigned mission
  useEffect(() => {
    if (!driverToken) return;

    function pollDriverMission() {
      fetch(`/api/dispatch/ambulance/${ambulanceId}`, {
        headers: authHeaders(driverToken)
      })
        .then((res) => (res.ok ? res.json() : []))
        .then(async (dispatches) => {
          if (Array.isArray(dispatches)) {
            const active = dispatches.find((d) => d.status !== 'Completed');
            if (active) {
              const [reqRes, hospRes] = await Promise.all([
                fetch(`/api/emergency/${active.requestId}`, { headers: authHeaders(driverToken) }),
                fetch(`/api/hospitals/${active.hospitalId}`)
              ]);
              const reqData = reqRes.ok ? await reqRes.json() : null;
              const hospData = hospRes.ok ? await hospRes.json() : null;
              setSelectedDispatch({
                dispatchId: active.dispatchId,
                status: active.status || 'En Route',
                patientName: reqData?.patientName || 'Emergency Patient',
                patientPhone: reqData?.patientPhone || '9876543210',
                emergencyType: reqData?.emergencyType || 'Medical Emergency',
                address: reqData?.address || 'Vadodara City Area',
                hospitalName: hospData?.hospitalName || 'Emergency Trauma Center',
                hospitalPhone: hospData?.contactNumber || '108',
                latitude: reqData?.latitude,
                longitude: reqData?.longitude
              });
            } else {
              setSelectedDispatch(null);
            }
          }
        })
        .catch(() => {});
    }

    pollDriverMission();
    const interval = setInterval(pollDriverMission, 3500);
    return () => clearInterval(interval);
  }, [driverToken, ambulanceId]);

  // Motion simulation & GPS broadcast to backend for driver
  useEffect(() => {
    if (!driverToken) return;
    const interval = setInterval(() => {
      const nextLat = +(driverCoords.latitude + 0.0004 * (Math.random() > 0.5 ? 1 : -1)).toFixed(5);
      const nextLng = +(driverCoords.longitude + 0.0003 * (Math.random() > 0.5 ? 1 : -1)).toFixed(5);
      setDriverCoords({ latitude: nextLat, longitude: nextLng });

      // Broadcast real GPS to backend
      if (ambulanceId && driverToken && !driverToken.startsWith('driver-token-')) {
        fetch(`/api/ambulances/${ambulanceId}/location?latitude=${nextLat}&longitude=${nextLng}`, {
          method: 'PUT',
          headers: authHeaders(driverToken)
        }).catch(() => {});
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [driverToken, ambulanceId, driverCoords]);

  // Update driver mission status
  async function handleUpdateDriverStatus(newStatus) {
    const token = driverToken;
    if (!token || !selectedDispatch?.dispatchId) {
      setVitalsMessage('Sign in and select an active mission before updating patient information.');
      return;
    }

    try {
      const res = await fetch(`/api/dispatch/${selectedDispatch.dispatchId}`, {
        method: 'PUT',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        const detail = await res.text();
        if (res.status === 401 || res.status === 403) {
          clearSession();
          setDriverToken('');
        }
        setVitalsMessage(detail || `Mission update failed (HTTP ${res.status}).`);
        return;
      }
      setVitalsMessage('');
    } catch (e) {
      console.error('Update driver status error:', e);
      setVitalsMessage('Could not reach the backend. Mission status was not updated.');
      return;
    }

    if (newStatus === 'Completed') {
      alert('Mission marked as completed! Returning ambulance to available standby.');
      setSelectedDispatch(null);
    } else {
      setSelectedDispatch((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  }

  // Send vitals
  async function handleSendVitals(e) {
    e.preventDefault();
    if (!driverToken || !selectedDispatch?.dispatchId) {
      setVitalsMessage('Sign in and select an active mission before sending vitals.');
      return;
    }

    const heartRate = Number(vitals.heartRate);
    const spo2 = Number(vitals.spo2.replace('%', '').trim());
    if (!Number.isInteger(heartRate) || heartRate < 1 || heartRate > 300 ||
        !Number.isInteger(spo2) || spo2 < 0 || spo2 > 100 ||
        !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(vitals.bloodPressure)) {
      setVitalsMessage('Enter a valid heart rate, blood pressure (for example 128/84), and SpO2 percentage.');
      return;
    }

    setVitalsMessage('');
    setSendingVitals(true);
    try {
      const res = await fetch(`/api/dispatch/${selectedDispatch.dispatchId}/vitals`, {
        method: 'POST',
        headers: { ...authHeaders(driverToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heartRate,
          bloodPressure: vitals.bloodPressure.trim(),
          spo2
        })
      });
      if (!res.ok) {
        const detail = await res.text();
        if (res.status === 401 || res.status === 403) {
          clearSession();
          setDriverToken('');
        }
        setVitalsMessage(detail || `Vitals were not sent (HTTP ${res.status}).`);
        return;
      }
      setVitalsSent(true);
      setVitalsMessage('Patient vitals sent to the assigned hospital ER.');
      window.setTimeout(() => setVitalsSent(false), 2500);
    } catch (error) {
      console.error('Send patient vitals error:', error);
      setVitalsMessage('Could not reach the backend. Patient vitals were not sent.');
    } finally {
      setSendingVitals(false);
    }
  }

  return (
    <div className="simple-page-container">
      {/* Clean Header with Simple Toggle */}
      <header className="clean-app-header">
        <div className="header-brand-box">
          <div className="yellow-cross-mark">🏥</div>
          <div>
            <h1>Hospital & Ambulance Fleet Portal</h1>
            <p>Port 3002 • Emergency Dispatch & Fleet Management</p>
          </div>
        </div>

        {/* Clean Sub-tab Toggle */}
        <div className="simple-role-toggle">
          <button
            type="button"
            className={`role-toggle-btn ${subTab === 'hospital' ? 'active' : ''}`}
            onClick={() => handleSubTabShift('hospital')}
          >
            🏥 Hospital ER & Fleet
          </button>
          <button
            type="button"
            className={`role-toggle-btn ${subTab === 'driver' ? 'active' : ''}`}
            onClick={() => handleSubTabShift('driver')}
          >
            🚑 Ambulance Driver
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 1. HOSPITAL ER & FLEET MANAGEMENT VIEW                                    */}
      {/* ========================================================================= */}
      {subTab === 'hospital' && (
        <div className="subtab-view-wrap">
          {!hospitalToken ? (
            /* Hospital Secure Login */
            <div className="simple-auth-card">
              <div className="auth-circle-badge hosp">🏥</div>
              <h2>Hospital ER Reception Login</h2>
              <p>Every hospital requires authorized login to access its emergency dispatch queue, ambulance fleet, and trauma bays.</p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  performHospitalLogin(hospPhone, hospitalName);
                }}
                className="hospital-login-form"
              >
                {/* 1. Select Hospital */}
                <div className="simple-form-group">
                  <label>1. Select Hospital to Access</label>
                  <select
                    className="simple-select-input"
                    value={hospitalId}
                    onChange={(e) => {
                      const selId = e.target.value;
                      setHospitalId(selId);
                      const matched = registeredHospitals.find((h) => String(h.hospitalId) === String(selId));
                      if (matched) {
                        setHospitalName(matched.hospitalName);
                        setHospPhone('');
                        setAuthMessage('');
                      } else {
                        setHospitalName('');
                        setHospPhone('');
                      }
                    }}
                    required
                  >
                    <option value="">-- Choose Hospital to Sign In --</option>
                    {registeredHospitals.map((h) => (
                      <option key={h.hospitalId} value={h.hospitalId}>
                        {h.hospitalName} ({h.address}) — ID #{h.hospitalId}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Hospital Name */}
                <div className="simple-form-group">
                  <label>2. Hospital Name</label>
                  <input
                    type="text"
                    className="simple-text-input"
                    placeholder="e.g. City Emergency Trauma Center"
                    value={hospitalName}
                    onChange={(e) => setHospitalName(e.target.value)}
                    required
                  />
                </div>

                {/* 3. Authorized Contact Phone */}
                <div className="simple-form-group">
                  <label>3. Registered Contact Phone (Private Credential)</label>
                  <input
                    type="tel"
                    className="simple-text-input"
                    placeholder="Enter registered hospital contact phone"
                    value={hospPhone}
                    onChange={(e) => setHospPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="simple-form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    className="simple-text-input"
                    autoComplete="current-password"
                    placeholder="Enter hospital password"
                    value={hospitalPassword}
                    onChange={(e) => setHospitalPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="simple-primary-btn"
                  disabled={!hospitalName || !hospPhone || !hospitalPassword}
                >
                  🔐 Log In to {hospitalName || 'Hospital'} ER Console
                </button>

                {authMessage && <p className="status-message error">{authMessage}</p>}
              </form>
            </div>
          ) : (
            /* Active Hospital Console */
            <div className="hospital-active-wrap">
              {/* Top Status Bar: Hospital Name & Sign Out */}
              <div className="hospital-profile-bar">
                <div className="hosp-bar-info">
                  <strong>🏥 {hospitalName}</strong>
                  <span className="hosp-phone-tag">📞 {hospPhone}</span>
                  <span className="hosp-zone-tag">📍 Hospital ID #{hospitalId}</span>
                </div>
                <button
                  type="button"
                  className="text-signout-btn"
                  onClick={handleHospitalSignOut}
                >
                  ⇄ Switch Hospital / Sign Out
                </button>
              </div>

              {/* SUCCESS MESSAGE BANNER */}
              {dispatchSuccessMsg && (
                <div className="simple-success-alert-banner">
                  <span>{dispatchSuccessMsg}</span>
                </div>
              )}
              {ambSuccessMsg && (
                <div className="simple-success-alert-banner">
                  <span>{ambSuccessMsg}</span>
                </div>
              )}

              {/* =================================================================== */}
              {/* 🚨 REAL-TIME EMERGENCY NOTIFICATION FOR NEAREST HOSPITAL           */}
              {/* =================================================================== */}
              {pendingEmergencies.length > 0 ? (
                <div className="nearest-hospital-alert-card">
                  <div className="alert-card-header">
                    <div className="alert-badge-row">
                      <span className="pulsing-siren-dot">🚨</span>
                      <strong className="alert-badge-text">
                        NEW EMERGENCY NEARBY — NEAREST HOSPITAL DISPATCH NOTIFICATION
                      </strong>
                    </div>
                    <span className="pending-badge">{pendingEmergencies.length} CALL PENDING</span>
                  </div>

                  <div className="nearest-emergency-items">
                    {pendingEmergencies.map((req) => (
                      <div key={req.requestId} className="emergency-call-dispatch-box">
                        <div className="emergency-call-info">
                          <div className="call-prio-tag critical">CRITICAL CALL #{req.requestId}</div>
                          <h3>{req.emergencyType}</h3>
                          <p className="call-location">
                            📍 <strong>Pickup:</strong> {req.address || 'Near Station Road, Vadodara'}
                          </p>
                          <p className="call-patient-meta">
                            Patient: <strong>{req.patientName || 'Emergency Victim'}</strong> • Phone: {req.patientPhone || '9876543210'}
                          </p>
                        </div>

                        {/* Assign Ambulance from Hospital's Own Fleet */}
                        <div className="assign-ambulance-controls">
                          <label className="assign-label">ASSIGN AMBULANCE FROM {hospitalName.toUpperCase()} FLEET:</label>
                          {hospitalFleet.length === 0 ? (
                            <div className="no-amb-fleet-notice">
                              <span>⚠️ No ambulances registered in {hospitalName}'s fleet.</span>
                              <button
                                type="button"
                                className="add-amb-inline-link"
                                onClick={() => setShowAddAmbModal(true)}
                              >
                                + Add an Ambulance to Fleet
                              </button>
                            </div>
                          ) : (
                            <>
                              <select
                                className="simple-select-input"
                                value={selectedAmbPerReq[req.requestId] || selectedAmbForDispatch || (hospitalFleet[0]?.ambulanceId ?? '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSelectedAmbPerReq((prev) => ({ ...prev, [req.requestId]: val }));
                                  setSelectedAmbForDispatch(val);
                                }}
                              >
                                {hospitalFleet.map((amb) => (
                                  <option key={amb.ambulanceId} value={amb.ambulanceId}>
                                    {amb.vehicleNumber} ({amb.driverName} - {amb.status})
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                className="assign-dispatch-btn"
                                onClick={() => handleAssignAmbulance(req.requestId)}
                              >
                                🚑 Assign Ambulance & Dispatch
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="nearest-hospital-alert-card no-calls">
                  <div className="alert-card-header">
                    <div className="alert-badge-row">
                      <span className="dot-green">●</span>
                      <strong className="alert-badge-text-green">
                        EMERGENCY DISPATCH MONITOR — ALL CLEAR
                      </strong>
                    </div>
                    <span className="standby-badge">0 PENDING DISTRESS CALLS</span>
                  </div>
                  <p className="no-pending-hint">
                    No active emergency calls pending in your hospital zone. You will be alerted immediately when a citizen requests emergency assistance nearby.
                  </p>
                </div>
              )}

              {/* =================================================================== */}
              {/* 🚑 HOSPITAL AMBULANCE FLEET MANAGEMENT (ONLY HOSPITAL CAN ADD)      */}
              {/* =================================================================== */}
              <div className="simple-card fleet-management-card">
                <div className="fleet-card-header">
                  <div>
                    <h3>🚑 {hospitalName} Ambulance Fleet ({hospitalFleet.length} Registered)</h3>
                    <p>Only {hospitalName} can manage and dispatch its own fleet.</p>
                  </div>
                  <button
                    type="button"
                    className="add-ambulance-pill-btn"
                    onClick={() => setShowAddAmbModal(true)}
                  >
                    + Add New Ambulance
                  </button>
                </div>

                {hospitalFleet.length === 0 ? (
                  <div className="empty-fleet-state">
                    <p>No ambulances currently registered to {hospitalName}.</p>
                    <small>Click "+ Add New Ambulance" above to register vehicles to your hospital's fleet.</small>
                  </div>
                ) : (
                  <div className="hospital-fleet-grid">
                    {hospitalFleet.map((amb) => (
                      <div key={amb.ambulanceId} className="hospital-amb-item">
                        <div className="amb-item-top">
                          <div className="amb-plate-badge">{amb.vehicleNumber}</div>
                          <span className={`amb-status-chip ${amb.status === 'Available' ? 'avail' : 'busy'}`}>
                            {amb.status}
                          </span>
                        </div>

                        <div className="amb-driver-details">
                          <p><strong>Driver:</strong> {amb.driverName}</p>
                          <p><strong>Phone:</strong> {amb.driverPhone}</p>
                          <p className="amb-type-tag">{amb.type || 'Advanced Life Support'}</p>
                        </div>

                        <div className="amb-actions-row">
                          <a href={`tel:${amb.driverPhone}`} className="amb-call-link">
                            📞 Call Driver
                          </a>
                          <button
                            type="button"
                            className="amb-remove-btn"
                            onClick={() => handleRemoveAmbulance(amb.ambulanceId)}
                          >
                            ✕ Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal: Add New Ambulance to Hospital Fleet */}
              {showAddAmbModal && (
                <div className="simple-modal-backdrop">
                  <div className="simple-modal-card">
                    <div className="modal-top">
                      <h3>+ Register Ambulance to {hospitalName}</h3>
                      <button type="button" onClick={() => setShowAddAmbModal(false)}>✕</button>
                    </div>

                    <form onSubmit={handleAddAmbulance} className="modal-form">
                      <div>
                        <label>Vehicle Plate Number</label>
                        <input
                          type="text"
                          className="simple-text-input"
                          placeholder="e.g. GJ-01-EM-2025"
                          value={newAmbPlate}
                          onChange={(e) => setNewAmbPlate(e.target.value.toUpperCase())}
                          required
                        />
                      </div>

                      <div>
                        <label>Paramedic / Driver Name</label>
                        <input
                          type="text"
                          className="simple-text-input"
                          placeholder="e.g. Dharmesh Solanki"
                          value={newAmbDriver}
                          onChange={(e) => setNewAmbDriver(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label>Driver Contact Phone</label>
                        <input
                          type="tel"
                          className="simple-text-input"
                          placeholder="e.g. 9825112233"
                          value={newAmbPhone}
                          onChange={(e) => setNewAmbPhone(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label>Driver Password (at least 12 characters)</label>
                        <input
                          type="password"
                          className="simple-text-input"
                          autoComplete="new-password"
                          minLength={12}
                          value={newAmbPassword}
                          onChange={(e) => setNewAmbPassword(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label>Ambulance Type / Equipment</label>
                        <select
                          className="simple-text-input"
                          value={newAmbType}
                          onChange={(e) => setNewAmbType(e.target.value)}
                        >
                          <option value="Advanced Life Support (ALS)">Advanced Life Support (ALS ICU on Wheels)</option>
                          <option value="Basic Life Support (BLS)">Basic Life Support (BLS)</option>
                          <option value="Neonatal / Pediatric ICU">Neonatal / Pediatric ICU</option>
                          <option value="Patient Transport Unit">Patient Transport Unit</option>
                        </select>
                      </div>

                      <div className="modal-buttons">
                        <button type="button" className="simple-ghost-btn" onClick={() => setShowAddAmbModal(false)}>
                          Cancel
                        </button>
                        <button type="submit" className="simple-primary-btn">
                          + Add Ambulance to Fleet
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Bed Capacity Management */}
              <div className="simple-card bed-tracker-card">
                <div className="bed-tracker-header">
                  <div>
                    <h3>Emergency Department Bed Capacity</h3>
                    <p>Live status of available ICU beds and trauma bays</p>
                  </div>
                </div>

                <div className="bed-controls-grid">
                  <div className="bed-stat-box">
                    <span className="bed-stat-title">🛏️ ICU Beds Available</span>
                    <strong className="bed-stat-num">{icuAvailable} / 8</strong>
                    <div className="bed-inc-dec-btns">
                      <button type="button" onClick={() => setIcuAvailable(Math.max(0, icuAvailable - 1))}>
                        - Occupy
                      </button>
                      <button type="button" onClick={() => setIcuAvailable(Math.min(8, icuAvailable + 1))}>
                        + Free
                      </button>
                    </div>
                  </div>

                  <div className="bed-stat-box">
                    <span className="bed-stat-title">⚡ Trauma Bay 1</span>
                    <strong className="bed-stat-status">{traumaBayStatus}</strong>
                    <button
                      type="button"
                      className="simple-toggle-link"
                      onClick={() => setTraumaBayStatus(traumaBayStatus === 'Ready' ? 'In Use' : 'Ready')}
                    >
                      Toggle {traumaBayStatus === 'Ready' ? 'In Use' : 'Ready'}
                    </button>
                  </div>

                  <div className="bed-stat-box">
                    <span className="bed-stat-title">💨 Ventilators</span>
                    <strong className="bed-stat-num">3 Units Available</strong>
                    <small>Sterilized & ready</small>
                  </div>
                </div>
              </div>

              {/* Live Incoming Case & Vitals */}
              {activeIncomingEmergency ? (
                <div className="simple-card incoming-card">
                  <div className="incoming-header">
                    <div className="incoming-tag">🚨 INCOMING AMBULANCE (ETA: 4 MINS)</div>
                    <span className="code-red-badge">CODE RED • CRITICAL</span>
                  </div>

                  <div className="incoming-patient-details">
                    <h3>Patient: {activeIncomingEmergency.patientName} ({activeIncomingEmergency.emergencyType})</h3>
                    <p>Ambulance <strong>{activeIncomingEmergency.vehicleNumber}</strong> • Paramedic {activeIncomingEmergency.driverName}</p>

                    <div className="live-vitals-display">
                      <div className="vital-chip">
                        <span>HEART RATE</span>
                        <strong>{activeIncomingEmergency.vitals?.heartRate ?? '—'} BPM</strong>
                      </div>
                      <div className="vital-chip">
                        <span>BLOOD PRESSURE</span>
                        <strong>{activeIncomingEmergency.vitals?.bloodPressure ?? '—'}</strong>
                      </div>
                      <div className="vital-chip">
                        <span>OXYGEN (SpO2)</span>
                        <strong>{activeIncomingEmergency.vitals ? `${activeIncomingEmergency.vitals.spo2}%` : '—'}</strong>
                      </div>
                    </div>
                    {activeIncomingEmergency.vitals?.recordedAt && (
                      <small>Last vitals update: {new Date(activeIncomingEmergency.vitals.recordedAt).toLocaleTimeString()}</small>
                    )}

                    <div className="incoming-actions">
                      <button
                        type="button"
                        className={`alert-team-btn ${traumaAlerted ? 'alerted' : ''}`}
                        onClick={() => setTraumaAlerted(!traumaAlerted)}
                      >
                        {traumaAlerted ? '✓ Trauma Bay 1 Alerted & Prepared' : '📢 Alert Trauma Team & Prepare Bay 1'}
                      </button>
                      <a href={`tel:${activeIncomingEmergency.driverPhone}`} className="simple-outline-btn">
                        📞 Call Ambulance Driver ({activeIncomingEmergency.driverPhone})
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="simple-card incoming-card standby">
                  <div className="incoming-header">
                    <div className="incoming-tag standby">🏥 ER TRAUMA BAYS ON STANDBY</div>
                    <span className="standby-badge">READY FOR ADMISSIONS</span>
                  </div>

                  <div className="incoming-patient-details standby">
                    <h3>No incoming emergency cases at this moment</h3>
                    <p>Trauma bays, ventilators, and emergency physicians are operational and ready for incoming emergencies.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. AMBULANCE DRIVER VIEW                                                  */}
      {/* ========================================================================= */}
      {subTab === 'driver' && (
        <div className="subtab-view-wrap">
          {!driverToken ? (
            /* Ambulance Driver Secure Login */
            <div className="simple-auth-card">
              <div className="auth-circle-badge">🚑</div>
              <h2>Ambulance Driver Login</h2>
              <p>Every ambulance driver requires authentication to receive emergency dispatches and broadcast live GPS.</p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  performDriverLogin(driverPhone, vehicleNumber);
                }}
                className="hospital-login-form"
              >
                <div className="simple-form-group">
                  <label>Ambulance Vehicle Plate Number</label>
                  <input
                    type="text"
                    className="simple-text-input"
                    placeholder="Enter assigned vehicle plate (e.g. GJ-01-EM-1080)"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    required
                  />
                </div>

                <div className="simple-form-group">
                  <label>Driver Registered Phone Number (Private Credential)</label>
                  <input
                    type="tel"
                    className="simple-text-input"
                    placeholder="Enter registered driver phone number"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="simple-form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    className="simple-text-input"
                    autoComplete="current-password"
                    placeholder="Enter driver password"
                    value={driverPassword}
                    onChange={(e) => setDriverPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="simple-primary-btn"
                  disabled={!vehicleNumber || !driverPhone || !driverPassword}
                >
                  🔐 Sign In to Ambulance Terminal
                </button>

                {authMessage && <p className="status-message error">{authMessage}</p>}
              </form>
            </div>
          ) : (
            /* Active Driver Terminal */
            <div className="driver-active-grid">
              {/* Left Column: Mission Controls */}
              <div className="driver-left-col">
                {selectedDispatch ? (
                  <>
                    <div className="simple-card call-summary-card">
                      <div className="call-card-top">
                        <span className="live-mission-tag">🚨 ACTIVE EMERGENCY MISSION</span>
                        <button
                          type="button"
                          className="text-signout-btn"
                          onClick={() => {
                            clearSession();
                            setDriverToken('');
                          }}
                        >
                          Sign Out
                        </button>
                      </div>

                      <h2 className="patient-headline">{selectedDispatch.emergencyType}</h2>
                      <p className="patient-location-text">
                        📍 <strong>Pickup:</strong> {selectedDispatch.address}
                      </p>

                      <div className="patient-caller-row">
                        <div>
                          <small>Patient Name</small>
                          <strong>{selectedDispatch.patientName}</strong>
                        </div>
                        <a href={`tel:${selectedDispatch.patientPhone}`} className="call-phone-pill">
                          📞 Call Patient ({selectedDispatch.patientPhone})
                        </a>
                      </div>

                      {/* 1-Click Mission Status Stepper */}
                      <div className="simple-stepper-box">
                        <label className="stepper-label">UPDATE MISSION PROGRESS (TAP TO ADVANCE):</label>
                        <div className="stepper-btns-row">
                          {[
                            { id: 'En Route', label: '1. En Route', icon: '🚙' },
                            { id: 'Arrived', label: '2. On Scene', icon: '📍' },
                            { id: 'Transporting', label: '3. Transporting', icon: '🚑' },
                            { id: 'Completed', label: '4. Completed', icon: '✓' }
                          ].map((step) => {
                            const isCurrent =
                              selectedDispatch.status === step.id ||
                              (step.id === 'En Route' && (selectedDispatch.status === 'Accepted' || selectedDispatch.status === 'Assigned'));
                            return (
                              <button
                                key={step.id}
                                type="button"
                                className={`simple-stage-btn ${isCurrent ? 'active' : ''}`}
                                onClick={() => handleUpdateDriverStatus(step.id)}
                              >
                                <span>{step.icon}</span>
                                <strong>{step.label}</strong>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Patient Vitals Entry (To ER) */}
                    <div className="simple-card vitals-input-card">
                      <h3>📊 Send Patient Vitals to Hospital ER</h3>
                      <p>Stream real-time vitals so the trauma doctor prepares before you arrive.</p>
                      <form onSubmit={handleSendVitals} className="vitals-row">
                        <div className="vital-field">
                          <label>❤️ Heart Rate</label>
                          <input
                            type="text"
                            value={vitals.heartRate}
                            onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })}
                            placeholder="e.g. 108 bpm"
                          />
                        </div>
                        <div className="vital-field">
                          <label>🩸 Blood Pressure</label>
                          <input
                            type="text"
                            value={vitals.bloodPressure}
                            onChange={(e) => setVitals({ ...vitals, bloodPressure: e.target.value })}
                            placeholder="e.g. 128/84"
                          />
                        </div>
                        <div className="vital-field">
                          <label>🫁 Oxygen (SpO2)</label>
                          <input
                            type="text"
                            value={vitals.spo2}
                            onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                            placeholder="e.g. 95%"
                          />
                        </div>
                        <button type="submit" className="vital-send-btn" disabled={sendingVitals}>
                          {sendingVitals ? 'Sending...' : vitalsSent ? '✓ Sent to ER' : '📡 Send Vitals'}
                        </button>
                      </form>
                      {vitalsMessage && <p className="status-message">{vitalsMessage}</p>}
                    </div>
                  </>
                ) : (
                  <div className="simple-card call-summary-card">
                    <div className="call-card-top">
                      <span className="live-mission-tag standby">🚑 AMBULANCE ON STANDBY</span>
                      <button
                        type="button"
                        className="text-signout-btn"
                        onClick={() => {
                          clearSession();
                          setDriverToken('');
                        }}
                      >
                        Sign Out
                      </button>
                    </div>

                    <div className="driver-standby-state">
                      <div className="standby-icon">🟢</div>
                      <h2 className="patient-headline">Vehicle {vehicleNumber} Available</h2>
                      <p className="patient-location-text">
                        No active emergency missions assigned. Driver GPS is actively broadcasting to city dispatch.
                      </p>
                      <div className="standby-notice-pill">
                        <span>⚡ Immediate audio and visual alert will trigger when an emergency call is assigned.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Navigation Map */}
              <div className="driver-right-col">
                <div className="simple-card">
                  <div className="map-card-header">
                    <h3>📍 Live Route Map</h3>
                    <span className="gps-live-tag">GPS BROADCASTING</span>
                  </div>
                  <MapView
                    height={320}
                    zoom={14}
                    markers={[
                      { latitude: driverCoords.latitude, longitude: driverCoords.longitude, label: `Ambulance ${vehicleNumber} (Live GPS)` },
                      ...(selectedDispatch ? [
                        { latitude: selectedDispatch.latitude || 22.3072, longitude: selectedDispatch.longitude || 73.1812, label: `Patient Pickup: ${selectedDispatch.patientName}` },
                        { latitude: 22.31, longitude: 73.19, label: 'Trauma Center' }
                      ] : [])
                    ]}
                  />
                </div>

                <div className="simple-card hospital-quick-info">
                  <span className="dest-eyebrow">
                    {selectedDispatch ? 'DESTINATION EMERGENCY ROOM' : 'BASE HOSPITAL STATION'}
                  </span>
                  <h4>{selectedDispatch?.hospitalName || 'Designated Base Hospital ER'}</h4>
                  {selectedDispatch?.hospitalPhone && (
                    <a href={`tel:${selectedDispatch.hospitalPhone}`} className="hospital-call-btn">
                      📞 Call Hospital ER ({selectedDispatch.hospitalPhone})
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
