import React, { useEffect, useState, useRef } from 'react';
import MapView from './MapView';
import { authHeaders, saveSession } from '../auth';

export default function HospitalView() {
  const [hospitalId, setHospitalId] = useState(localStorage.getItem('role') === 'Hospital' ? localStorage.getItem('hospitalId') || '' : '');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [token, setToken] = useState(localStorage.getItem('role') === 'Hospital' ? localStorage.getItem('token') || '' : '');
  const [dispatches, setDispatches] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [newAmbulance, setNewAmbulance] = useState({ vehicleNumber: '', driverName: '', driverPhone: '', password: '', type: 'Basic', latitude: 0, longitude: 0, status: 'Available' });
  const [selected, setSelected] = useState(null);
  const timer = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  async function load() {
    if (!hospitalId) return;
    const headers = authHeaders(token);
    const res = await fetch(`/api/dispatch/hospital/${hospitalId}`, { headers });
    if (res.ok) {
      const nextDispatches = await res.json();
      setDispatches(nextDispatches);
      if (selectedRef.current) {
        const current = nextDispatches.find((dispatch) => dispatch.dispatchId === selectedRef.current.dispatch.dispatchId);
        if (current) viewDetails(current);
      }
    }
    const pending = await fetch(`/api/emergency/available-for-hospital/${hospitalId}`, { headers });
    if (pending.ok) setPendingRequests(await pending.json());
    const fleet = await fetch(`/api/hospitals/${hospitalId}/ambulances`, { headers });
    if (fleet.ok) setAmbulances(await fleet.json());
  }

  async function saveAmbulance(event) {
    event.preventDefault();
    const response = await fetch('/api/ambulances', {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newAmbulance, hospitalId: Number(hospitalId) })
    });
    if (!response.ok) { alert(await response.text()); return; }
    setNewAmbulance({ vehicleNumber: '', driverName: '', driverPhone: '', password: '', type: 'Basic', latitude: 0, longitude: 0, status: 'Available' });
    await load();
  }

  async function removeAmbulance(ambulanceId) {
    const response = await fetch(`/api/ambulances/${ambulanceId}`, { method: 'DELETE', headers: authHeaders(token) });
    if (!response.ok) { alert(await response.text()); return; }
    await load();
  }

  async function acceptRequest(requestId) {
    const res = await fetch(`/api/emergency/${requestId}/accept?hospitalId=${hospitalId}`, { method: 'POST', headers: authHeaders(token) });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    await load();
  }

  useEffect(() => {
    if (hospitalId) {
      load();
      timer.current = setInterval(load, 5000);
      return () => clearInterval(timer.current);
    }
  }, [hospitalId]);

  async function viewDetails(d) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const r = await fetch(`/api/emergency/${d.requestId}`, { headers });
    const amb = await fetch(`/api/ambulances/${d.ambulanceId}`, { headers });
      const hospitalResponse = await fetch(`/api/hospitals/${d.hospitalId}`, { headers });
    const patient = r.ok ? await r.json() : null;
    const ambulance = amb.ok ? await amb.json() : null;
      const hospital = hospitalResponse.ok ? await hospitalResponse.json() : null;
      setSelected({ dispatch: d, patient, ambulance, hospital });
  }

  async function hospitalLogin() {
    try {
      const res = await fetch('/api/auth/hospital-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, hospitalName, password }) });
      if (!res.ok) {
        const t = await res.text();
        alert('Login failed: ' + t);
        return;
      }
      const data = await res.json();
      saveSession({ token: data.token, role: 'Hospital', hospitalId: data.hospitalId });
      setToken(data.token);
      setHospitalId(String(data.hospitalId));
      setPassword('');
    } catch (e) {
      alert('Network error');
    }
  }

  const markers = [];
  if (selected?.patient) markers.push({ latitude: selected.patient.latitude, longitude: selected.patient.longitude, label: `Patient: ${selected.patient.patientName}` });
  if (selected?.ambulance) markers.push({ latitude: selected.ambulance.latitude, longitude: selected.ambulance.longitude, label: `Ambulance: ${selected.ambulance.vehicleNumber}` });
    if (selected?.hospital) markers.push({ latitude: selected.hospital.latitude, longitude: selected.hospital.longitude, label: `Hospital: ${selected.hospital.hospitalName}` });

  return (
    <div>
      <h3>Hospital View</h3>
      {!token && (
        <div className="role-login-card">
          <div><span className="eyebrow">Hospital access</span><h3>Sign in to receive dispatches</h3><p>See nearby emergencies and track every ambulance assigned to your hospital.</p></div>
          <div className="role-login-fields">
            <input placeholder="Hospital contact number" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input placeholder="Hospital name (optional)" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} />
            <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="secondary-btn" onClick={hospitalLogin} type="button" disabled={!phone || !password}>Sign in</button>
          </div>
        </div>
      )}

      {token && <div className="role-toolbar"><span>Hospital <strong>#{hospitalId}</strong> is monitoring incoming ambulances</span><button className="ghost-btn" onClick={load} type="button">Refresh feed</button></div>}

      {token && <section className="card resource-item" style={{ marginBottom: 16 }}>
        <h4>Manage your ambulances and drivers</h4>
        <form onSubmit={saveAmbulance} className="form-stack">
          <input placeholder="Vehicle number" value={newAmbulance.vehicleNumber} onChange={(e) => setNewAmbulance({ ...newAmbulance, vehicleNumber: e.target.value })} required />
          <input placeholder="Driver name" value={newAmbulance.driverName} onChange={(e) => setNewAmbulance({ ...newAmbulance, driverName: e.target.value })} required />
          <input placeholder="Driver phone" value={newAmbulance.driverPhone} onChange={(e) => setNewAmbulance({ ...newAmbulance, driverPhone: e.target.value })} required />
          <input type="password" autoComplete="new-password" minLength={12} placeholder="Driver password (at least 12 characters)" value={newAmbulance.password} onChange={(e) => setNewAmbulance({ ...newAmbulance, password: e.target.value })} required />
          <button className="secondary-btn" type="submit">Add ambulance and driver</button>
        </form>
        <div className="resource-list">
          {ambulances.map((ambulance) => <div key={ambulance.ambulanceId} className="muted-text">
            {ambulance.vehicleNumber} · {ambulance.driverName} · {ambulance.status}
            <button className="ghost-btn" type="button" onClick={() => removeAmbulance(ambulance.ambulanceId)}>Remove</button>
          </div>)}
        </div>
      </section>}

      <div className="role-grid">
        <div style={{ flex: 1 }}>
          <h4>Nearby requests</h4>
          {pendingRequests.length === 0 && <div className="muted-text">No pending requests nearby</div>}
          {pendingRequests.map((r) => (
            <div key={r.requestId} style={{ border: '1px solid #eee', padding: 8, marginBottom: 8 }}>
              <div><strong>{r.patientName}</strong> · {r.priority}</div>
              <div>{r.emergencyType} · {r.latitude}, {r.longitude}</div>
              <button onClick={() => acceptRequest(r.requestId)} style={{ marginTop: 6 }}>Accept and dispatch nearest ambulance</button>
            </div>
          ))}
          <h4>Incoming / Assigned Dispatches</h4>
          {dispatches.length === 0 && <div className="muted-text">No dispatches assigned</div>}
          {dispatches.map((d) => (
            <div key={d.dispatchId} style={{ border: '1px solid #eee', padding: 8, marginBottom: 8 }}>
              <div>Dispatch: {d.dispatchId}</div>
              <div>Request: {d.requestId}</div>
              <div>Ambulance: {d.ambulanceId}</div>
              <div className="status-line"><span className={`status-pill ${String(d.status).toLowerCase().replaceAll(' ', '-')}`}>{d.status}</span><span>{d.status === 'Accepted' || d.status === 'On the Way' ? 'Ambulance is coming' : d.status === 'Arrived' ? 'Ambulance has arrived' : 'Dispatch updated'}</span></div>
              <button onClick={() => viewDetails(d)} style={{ marginTop: 6 }}>View Details</button>
            </div>
          ))}
        </div>

        <div style={{ flex: 2 }}>
          <h4>Map & Details</h4>
          <MapView markers={markers} />
          {selected?.patient && (
            <div className="info-panel">
              <div><strong>{selected.patient.patientName}</strong><span>{selected.patient.patientPhone || 'No contact number'}</span></div>
              <div><strong>Ambulance status</strong><span>{selected.dispatch.status === 'Accepted' || selected.dispatch.status === 'On the Way' ? 'Coming to hospital' : selected.dispatch.status}</span></div>
              {selected.ambulance && <div><strong>Live ambulance location</strong><span>{selected.ambulance.latitude}, {selected.ambulance.longitude}</span></div>}
              <div><strong>Patient location</strong><span>{selected.patient.latitude}, {selected.patient.longitude}</span></div>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => fetch(`/api/dispatch/${selected.dispatch.dispatchId}`, { method: 'PUT', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'HospitalNotified' }) }).then(load)}>Mark Notified</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
