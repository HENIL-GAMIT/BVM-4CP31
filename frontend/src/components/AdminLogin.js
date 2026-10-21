import React, {useState} from 'react';
import { saveSession } from '../auth';

export default function AdminLogin({ onAuth }) {
  const [identifier, setIdentifier] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');

  async function login(e) {
    e.preventDefault();
    const body = { Email: identifier, Password: pass };
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.role !== 'Admin') {
          setMsg('This account is not allowed to access admin tools.');
          return;
        }
        saveSession({ token: data.token, role: data.role });
        setMsg('Logged in successfully.');
        onAuth();
      } else {
        // Try to decode server error to show a more helpful message
        let errMsg = 'Login failed. Please check your credentials.';
        try {
          const json = await res.json();
          if (json && json.detail) errMsg = json.detail;
          else if (json && json.message) errMsg = json.message;
          else if (typeof json === 'string') errMsg = json;
        } catch (err) {
          const text = await res.text().catch(() => null);
          if (text) errMsg = text;
        }
        setMsg(errMsg);
      }
    } catch (e) {
      setMsg('Cannot reach the backend at http://localhost:5000. Start the .NET API and try again.');
    }
  }

  return (
    <div className="admin-login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <h3>Admin access</h3>
          <p>Secure command center login</p>
        </div>

        <form onSubmit={login} className="login-form">
          <input
            placeholder="Email or phone"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <input
            placeholder="Password"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <button className="primary-btn" type="submit">Login</button>
        </form>

        <div className={`status-message ${msg && !msg.toLowerCase().includes('failed') && !msg.toLowerCase().includes('error') ? 'success' : msg ? 'error' : ''}`}>
          {msg || 'Use your secure admin credentials'}
        </div>
      </div>
    </div>
  );
}
