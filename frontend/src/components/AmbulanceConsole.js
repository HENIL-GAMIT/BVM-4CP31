import React, {useEffect, useState} from 'react';

export default function AmbulanceConsole(){
  const [ambulanceId, setAmbulanceId] = useState('');
  const [dispatches, setDispatches] = useState([]);

  async function load(){
    if(!ambulanceId) return;
    const res = await fetch(`/api/dispatch/ambulance/${ambulanceId}`);
    if(res.ok) setDispatches(await res.json());
  }

  useEffect(()=>{ if(ambulanceId) load(); },[ambulanceId]);

  async function updateStatus(dispatchId, status){
    await fetch(`/api/dispatch/${dispatchId}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ status })});
    load();
  }

  return (
    <div>
      <h3>Ambulance Console</h3>
      <div>
        <input placeholder="AmbulanceId" value={ambulanceId} onChange={e=>setAmbulanceId(e.target.value)} />
        <button onClick={load}>Load</button>
      </div>
      <div>
        {dispatches.map(d=> (
          <div key={d.dispatchId} style={{border:'1px solid #ddd',padding:8,margin:8}}>
            <div>Request: {d.requestId}</div>
            <div>Status: {d.status}</div>
            <button onClick={()=>updateStatus(d.dispatchId, 'On the Way')}>On the Way</button>
            <button onClick={()=>updateStatus(d.dispatchId, 'Arrived')}>Arrived</button>
            <button onClick={()=>updateStatus(d.dispatchId, 'Transporting')}>Transporting</button>
            <button onClick={()=>updateStatus(d.dispatchId, 'Completed')}>Complete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
