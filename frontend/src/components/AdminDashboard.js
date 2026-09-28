import React, {useEffect, useState} from 'react';
import { authHeaders } from '../auth';

export default function AdminDashboard() {
  const [requests, setRequests] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [newAmb, setNewAmb] = useState({
    hospitalId: '',
    vehicleNumber: '',
    driverName: '',
    driverPhone: '',
    type: 'Basic',
    latitude: 0,
    longitude: 0,
    status: 'Available'
  });
  const [newHosp, setNewHosp] = useState({
    hospitalName: '',
    address: '',
    latitude: 0,
    longitude: 0,
    contactNumber: '',
    status: 'Open'
  });

  async function load() {
    const r = await fetch('/api/emergency');
    setRequests(await r.json());

    const a = await fetch('/api/ambulances', { headers: authHeaders() });
    setAmbulances(await a.json());

    const h = await fetch('/api/hospitals');
    setHospitals(await h.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function createAmbulance(e) {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const headers = {'Content-Type': 'application/json'};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch('/api/ambulances', {
      method: 'POST',
      headers,
      body: JSON.stringify({...newAmb, hospitalId: Number(newAmb.hospitalId)})
    });

    setNewAmb({
      hospitalId: '',
      vehicleNumber: '',
      driverName: '',
      driverPhone: '',
      type: 'Basic',
      latitude: 0,
      longitude: 0,
      status: 'Available'
    });
    load();
  }

  async function createHospital(e) {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const headers = {'Content-Type': 'application/json'};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch('/api/hospitals', {
      method: 'POST',
      headers,
      body: JSON.stringify(newHosp)
    });

    setNewHosp({
      hospitalName: '',
      address: '',
      latitude: 0,
      longitude: 0,
      contactNumber: '',
      status: 'Open'
    });
    load();
  }

  return (
    <div className="dashboard-layout">
      <section>
        <h3 className="section-heading">Emergency Requests</h3>
        <div className="request-list">
          {requests.map((r) => (
            <div key={r.requestId} className="request-item">
              <div className="request-top">
                <div className="request-name">{r.patientName}</div>
                <span className="request-badge">{r.priority}</span>
              </div>
              <div className="request-meta">
                {r.patientPhone} • {r.emergencyType}
              </div>
              <div className="request-meta">
                Lat {r.latitude} • Lon {r.longitude}
              </div>
              <div className="request-meta">{r.status || 'Pending'} · Hospital acceptance controls dispatch</div>
            </div>
          ))}
        </div>
      </section>

      <aside className="side-panel">
        <div>
          <h3 className="section-heading">Operations</h3>
          <div className="metric-list">
            <div className="metric-item">
              <div className="metric-number">{requests.length}</div>
              <div className="metric-label">Open requests</div>
            </div>
            <div className="metric-item">
              <div className="metric-number">{ambulances.length}</div>
              <div className="metric-label">Ambulances</div>
            </div>
            <div className="metric-item">
              <div className="metric-number">{hospitals.length}</div>
              <div className="metric-label">Hospitals</div>
            </div>
            <div className="metric-item">
              <div className="metric-number">24/7</div>
              <div className="metric-label">Coverage</div>
            </div>
          </div>
        </div>

        <div className="card resource-item">
          <h3 className="section-heading">Ambulances</h3>
          <div className="resource-list">
            {ambulances.map((a) => (
              <div key={a.ambulanceId} className="muted-text">
                {a.vehicleNumber} — {a.status}
              </div>
            ))}
          </div>

          <h4 style={{ margin: '18px 0 10px' }}>Add Ambulance</h4>
          <form onSubmit={createAmbulance} className="form-stack">
            <select value={newAmb.hospitalId} onChange={(e) => setNewAmb({ ...newAmb, hospitalId: e.target.value })} required>
              <option value="">Managed by hospital...</option>
              {hospitals.map((h) => <option key={h.hospitalId} value={h.hospitalId}>{h.hospitalName}</option>)}
            </select>
            <input placeholder="Vehicle" value={newAmb.vehicleNumber} onChange={(e) => setNewAmb({ ...newAmb, vehicleNumber: e.target.value })} />
            <input placeholder="Driver" value={newAmb.driverName} onChange={(e) => setNewAmb({ ...newAmb, driverName: e.target.value })} />
            <input placeholder="Phone" value={newAmb.driverPhone} onChange={(e) => setNewAmb({ ...newAmb, driverPhone: e.target.value })} />
            <button className="secondary-btn" type="submit">Add Ambulance</button>
          </form>
        </div>

        <div className="card resource-item">
          <h3 className="section-heading">Hospitals</h3>
          <div className="resource-list">
            {hospitals.map((h) => (
              <div key={h.hospitalId} className="muted-text">
                {h.hospitalName}
              </div>
            ))}
          </div>

          <h4 style={{ margin: '18px 0 10px' }}>Add Hospital</h4>
          <form onSubmit={createHospital} className="form-stack">
            <input placeholder="Name" value={newHosp.hospitalName} onChange={(e) => setNewHosp({ ...newHosp, hospitalName: e.target.value })} />
            <input placeholder="Address" value={newHosp.address} onChange={(e) => setNewHosp({ ...newHosp, address: e.target.value })} />
            <input placeholder="Contact" value={newHosp.contactNumber} onChange={(e) => setNewHosp({ ...newHosp, contactNumber: e.target.value })} />
            <input type="number" step="any" placeholder="Latitude" value={newHosp.latitude} onChange={(e) => setNewHosp({ ...newHosp, latitude: parseFloat(e.target.value) || 0 })} required />
            <input type="number" step="any" placeholder="Longitude" value={newHosp.longitude} onChange={(e) => setNewHosp({ ...newHosp, longitude: parseFloat(e.target.value) || 0 })} required />
            <button className="secondary-btn" type="submit">Add Hospital</button>
          </form>
        </div>
      </aside>
    </div>
  );
}
