import React, { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../auth';

export default function ReportsView() {
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [hospitals, setHospitals] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch('/api/admin/summary', { headers }),
      fetch('/api/emergency'),
      fetch('/api/dispatch'),
      fetch('/api/ambulances', { headers: authHeaders() }),
      fetch('/api/hospitals')
    ]).then(async ([summaryResponse, requestsResponse, dispatchesResponse, ambulancesResponse, hospitalsResponse]) => {
      setSummary(summaryResponse.ok ? await summaryResponse.json() : null);
      setRequests(requestsResponse.ok ? await requestsResponse.json() : []);
      setDispatches(dispatchesResponse.ok ? await dispatchesResponse.json() : []);
      setAmbulances(ambulancesResponse.ok ? await ambulancesResponse.json() : []);
      setHospitals(hospitalsResponse.ok ? await hospitalsResponse.json() : []);
    });
  }, []);

  const completed = dispatches.filter((dispatch) => dispatch.status === 'Completed').length;
  const active = dispatches.filter((dispatch) => dispatch.status !== 'Completed').length;
  const highPriority = requests.filter((request) => ['High', 'Critical', 'Urgent'].includes(request.priority)).length;
  const completionRate = dispatches.length ? Math.round((completed / dispatches.length) * 100) : 0;
  const priorityBreakdown = useMemo(() => {
    const counts = requests.reduce((result, request) => { const key = request.priority || 'Normal'; result[key] = (result[key] || 0) + 1; return result; }, {});
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }, [requests]);

  return (
    <section className="module-view">
      <div className="module-heading">
        <div><span className="eyebrow">Live performance</span><h2>Reports</h2><p>A clear read on demand, response activity, and network capacity.</p></div>
        <span className="live-indicator"><i /> Updated just now</span>
      </div>

      <div className="report-grid">
        <div className="report-card report-card-dark"><span>Total requests</span><strong>{summary?.totalEmergencyRequests ?? requests.length}</strong><small>All time emergency volume</small></div>
        <div className="report-card"><span>Active dispatches</span><strong>{active}</strong><small>Currently in progress</small></div>
        <div className="report-card"><span>Completion rate</span><strong>{completionRate}%</strong><small>{completed} completed dispatches</small></div>
        <div className="report-card"><span>Priority alerts</span><strong>{highPriority}</strong><small>High or critical requests</small></div>
      </div>

      <div className="report-columns">
        <div className="card report-panel">
          <div className="panel-title"><div><span className="eyebrow">Demand mix</span><h3>Request priorities</h3></div><span className="panel-total">{requests.length} total</span></div>
          <div className="bar-list">{priorityBreakdown.length === 0 ? <div className="empty-state">No request data yet.</div> : priorityBreakdown.map(([label, count]) => <div className="bar-row" key={label}><div><span>{label}</span><strong>{count}</strong></div><div className="bar-track"><i style={{ width: `${Math.max(8, (count / requests.length) * 100)}%` }} /></div></div>)}</div>
        </div>
        <div className="card report-panel">
          <div className="panel-title"><div><span className="eyebrow">Network health</span><h3>Resources online</h3></div></div>
          <div className="resource-health"><div><span>Ambulances</span><strong>{ambulances.filter((item) => item.status === 'Available').length}<small> / {ambulances.length} available</small></strong></div><div><span>Hospitals</span><strong>{hospitals.filter((item) => !item.status || item.status === 'Open').length}<small> / {hospitals.length} open</small></strong></div><div><span>Call records</span><strong>{summary?.totalCalls ?? 0}</strong></div></div>
        </div>
      </div>
    </section>
  );
}