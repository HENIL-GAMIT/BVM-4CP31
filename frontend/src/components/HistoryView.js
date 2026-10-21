import React, { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../auth';

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function HistoryView() {
  const [requests, setRequests] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [calls, setCalls] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const headers = authHeaders();
    const [requestsResponse, dispatchesResponse, callsResponse] = await Promise.all([
      fetch('/api/emergency', { headers }),
      fetch('/api/dispatch', { headers }),
      fetch('/api/calls', { headers })
    ]);
    setRequests(requestsResponse.ok ? await requestsResponse.json() : []);
    setDispatches(dispatchesResponse.ok ? await dispatchesResponse.json() : []);
    setCalls(callsResponse.ok ? await callsResponse.json() : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const dispatchByRequest = new Map(dispatches.map((dispatch) => [dispatch.requestId, dispatch]));
    return requests
      .map((request) => ({ request, dispatch: dispatchByRequest.get(request.requestId) }))
      .filter(({ request, dispatch }) => {
        const haystack = `${request.patientName} ${request.patientPhone} ${request.emergencyType} ${request.address} ${request.requestId}`.toLowerCase();
        const matchesQuery = haystack.includes(query.toLowerCase());
        const currentStatus = dispatch?.status || request.status || 'Pending';
        return matchesQuery && (status === 'All' || currentStatus === status);
      })
      .sort((a, b) => new Date(b.request.requestTime) - new Date(a.request.requestTime));
  }, [requests, dispatches, query, status]);

  const statuses = ['All', ...new Set(requests.map((request) => dispatches.find((dispatch) => dispatch.requestId === request.requestId)?.status || request.status || 'Pending'))];

  return (
    <section className="module-view">
      <div className="module-heading">
        <div>
          <span className="eyebrow">Operations archive</span>
          <h2>Trip history</h2>
          <p>Search every emergency request and track how it moved through dispatch.</p>
        </div>
        <button className="ghost-btn" type="button" onClick={load}>↻ Refresh</button>
      </div>

      <div className="filter-bar">
        <input aria-label="Search history" placeholder="Search patient, phone, address or request ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Filter history by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {statuses.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>

      <div className="history-summary">
        <div><strong>{rows.length}</strong><span>Visible trips</span></div>
        <div><strong>{calls.length}</strong><span>Logged calls</span></div>
        <div><strong>{dispatches.filter((dispatch) => dispatch.status === 'Completed').length}</strong><span>Completed</span></div>
      </div>

      <div className="history-table-wrap">
        {loading ? <div className="empty-state">Loading activity...</div> : rows.length === 0 ? <div className="empty-state">No matching trips found.</div> : (
          <table className="history-table">
            <thead><tr><th>Request</th><th>Patient</th><th>Priority</th><th>Dispatch</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>{rows.map(({ request, dispatch }) => {
              const currentStatus = dispatch?.status || request.status || 'Pending';
              return <tr key={request.requestId}>
                <td><strong>#{request.requestId}</strong><small>{request.emergencyType || 'Emergency'}</small></td>
                <td><strong>{request.patientName || 'Unknown patient'}</strong><small>{request.address || request.patientPhone || 'Location not provided'}</small></td>
                <td><span className={`priority-pill ${String(request.priority).toLowerCase()}`}>{request.priority || 'Normal'}</span></td>
                <td>{dispatch ? `#${dispatch.dispatchId}` : 'Waiting'}</td>
                <td>{formatDate(request.requestTime)}</td>
                <td><span className="status-pill">{currentStatus}</span></td>
              </tr>;
            })}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}