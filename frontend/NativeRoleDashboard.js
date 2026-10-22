import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

const palette = {
  background: '#07111f',
  panel: '#102035',
  panelAlt: '#172a42',
  border: '#263b55',
  text: '#f8fafc',
  muted: '#a8b3c5',
  blue: '#2563eb',
  green: '#16a34a',
  red: '#dc2626'
};

async function request(apiUrl, path, token, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed (HTTP ${response.status}).`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export default function NativeRoleDashboard({ apiUrl, session, onSignOut }) {
  const [data, setData] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locationSubscription = useRef(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [vitals, setVitals] = useState({ heartRate: '', bloodPressure: '', spo2: '' });

  const loadDashboard = useCallback(async () => {
    try {
      if (session.role === 'Admin') {
        const [summary, emergencies, ambulances] = await Promise.all([
          request(apiUrl, '/api/admin/summary', session.token),
          request(apiUrl, '/api/emergency', session.token),
          request(apiUrl, '/api/ambulances', session.token)
        ]);
        setData({ summary, emergencies, ambulances });
      } else if (session.role === 'Hospital') {
        const hospitalId = session.hospitalId;
        const [fleet, emergencies, dispatches] = await Promise.all([
          request(apiUrl, `/api/hospitals/${hospitalId}/ambulances`, session.token),
          request(apiUrl, `/api/emergency/available-for-hospital/${hospitalId}`, session.token),
          request(apiUrl, `/api/dispatch/hospital/${hospitalId}`, session.token)
        ]);
        const active = dispatches.find((item) => item.status !== 'Completed');
        let activeDetails = null;
        if (active) {
          const [patient, ambulance, report] = await Promise.all([
            request(apiUrl, `/api/emergency/${active.requestId}`, session.token),
            request(apiUrl, `/api/ambulances/${active.ambulanceId}`, session.token),
            request(apiUrl, `/api/dispatch/${active.dispatchId}/vitals`, session.token).catch((error) => {
              if (String(error.message).includes('HTTP 404')) return null;
              throw error;
            })
          ]);
          activeDetails = { ...active, patient, ambulance, report };
        }
        setData({ fleet, emergencies, active: activeDetails });
      } else if (session.role === 'Driver') {
        const dispatches = await request(apiUrl, `/api/dispatch/ambulance/${session.ambulanceId}`, session.token);
        const active = dispatches.find((item) => item.status !== 'Completed');
        let activeDetails = null;
        if (active) {
          const [patient, hospital] = await Promise.all([
            request(apiUrl, `/api/emergency/${active.requestId}`, session.token),
            request(apiUrl, `/api/hospitals/${active.hospitalId}`)
          ]);
          activeDetails = { ...active, patient, hospital };
        }
        setData({ active: activeDetails, history: dispatches });
      }
      setMessage('');
      return true;
    } catch (error) {
      setMessage(error.message || 'Could not load dashboard data.');
      return false;
    }
  }, [apiUrl, session]);

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 6000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => () => {
    locationSubscription.current?.remove();
  }, []);

  async function performAction(action) {
    setBusy(true);
    setMessage('');
    try {
      const successMessage = await action();
      const reloaded = await loadDashboard();
      if (reloaded && typeof successMessage === 'string') setMessage(successMessage);
    } catch (error) {
      setMessage(error.message || 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  async function dispatchAsAdmin(emergency) {
    await performAction(async () => {
      let ambulance = null;
      try {
        ambulance = await request(
          apiUrl,
          `/api/ambulances/nearest?lat=${emergency.latitude}&lng=${emergency.longitude}`,
          session.token
        );
      } catch (error) {
        if (!String(error.message).includes('HTTP 404')) throw error;
      }
      ambulance ||= data.ambulances?.find((item) => item.status === 'Available');
      if (!ambulance) throw new Error('No available ambulance was found.');
      await request(apiUrl, '/api/dispatch', session.token, {
        method: 'POST',
        body: JSON.stringify({
          requestId: emergency.requestId,
          ambulanceId: ambulance.ambulanceId,
          hospitalId: ambulance.hospitalId
        })
      });
      return `Ambulance ${ambulance.vehicleNumber} assigned to emergency #${emergency.requestId}.`;
    });
  }

  async function acceptEmergency(emergency) {
    const ambulance = data.fleet?.find((item) => item.status === 'Available');
    if (!ambulance) {
      setMessage('Add or free an ambulance before accepting this emergency.');
      return;
    }
    await performAction(async () => {
      await request(
        apiUrl,
        `/api/emergency/${emergency.requestId}/accept?hospitalId=${session.hospitalId}&ambulanceId=${ambulance.ambulanceId}`,
        session.token,
        { method: 'POST' }
      );
      return `Ambulance ${ambulance.vehicleNumber} assigned to emergency #${emergency.requestId}.`;
    });
  }

  async function addAmbulance(fields) {
    if (!fields.vehicleNumber.trim() || !fields.driverName.trim() || !fields.driverPhone.trim()) {
      setMessage('Enter the vehicle number, driver name, and phone number.');
      return;
    }
    if (fields.password.length < 12 || fields.password.length > 128) {
      setMessage('Driver password must contain between 12 and 128 characters.');
      return;
    }
    await performAction(async () => {
      await request(apiUrl, '/api/ambulances', session.token, {
        method: 'POST',
        body: JSON.stringify({
          hospitalId: session.hospitalId,
          vehicleNumber: fields.vehicleNumber.trim().toUpperCase(),
          driverName: fields.driverName.trim(),
          driverPhone: fields.driverPhone.trim(),
          password: fields.password,
          type: 'Ambulance',
          status: 'Available'
        })
      });
      return 'Ambulance and driver account created.';
    });
  }

  async function updateDispatchStatus(status) {
    if (!data.active) return;
    await performAction(async () => {
      await request(apiUrl, `/api/dispatch/${data.active.dispatchId}`, session.token, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      return `Mission status updated to ${status}.`;
    });
  }

  async function toggleGps() {
    if (gpsActive) {
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      setGpsActive(false);
      setMessage('Live location sharing stopped.');
      return;
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setMessage('Allow location access to share ambulance position.');
      return;
    }
    setBusy(true);
    try {
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
        async ({ coords }) => {
          try {
            await request(
              apiUrl,
              `/api/ambulances/${session.ambulanceId}/location?latitude=${coords.latitude}&longitude=${coords.longitude}`,
              session.token,
              { method: 'PUT' }
            );
          } catch (error) {
            setMessage(error.message || 'Could not update ambulance location.');
          }
        }
      );
      setGpsActive(true);
      setMessage('Live location sharing is active.');
    } catch (error) {
      setMessage(error.message || 'Could not start GPS sharing.');
    } finally {
      setBusy(false);
    }
  }

  async function sendVitals() {
    const heartRate = Number(vitals.heartRate);
    const spo2 = Number(vitals.spo2);
    if (!data.active || !Number.isInteger(heartRate) || heartRate < 1 || heartRate > 300 ||
        !Number.isInteger(spo2) || spo2 < 0 || spo2 > 100 ||
        !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(vitals.bloodPressure)) {
      setMessage('Enter valid heart rate, blood pressure (128/84), and SpO2 values.');
      return;
    }
    await performAction(async () => {
      await request(apiUrl, `/api/dispatch/${data.active.dispatchId}/vitals`, session.token, {
        method: 'POST',
        body: JSON.stringify({ heartRate, bloodPressure: vitals.bloodPressure.trim(), spo2 })
      });
      return 'Patient vitals sent to the hospital.';
    });
  }

  const title = session.role === 'Admin'
    ? 'Command Center'
    : session.role === 'Hospital'
      ? 'Hospital Dashboard'
      : 'Driver Dashboard';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{session.role.toUpperCase()} PORTAL</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Pressable onPress={onSignOut} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {message ? <Text style={styles.notice}>{message}</Text> : null}
      <Pressable style={styles.refresh} onPress={() => performAction(loadDashboard)} disabled={busy}>
        {busy ? <ActivityIndicator color={palette.text} /> : <Text style={styles.buttonText}>Refresh dashboard</Text>}
      </Pressable>

      {session.role === 'Admin' && (
        <>
          <Text style={styles.sectionTitle}>Operations overview</Text>
          <View style={styles.metricGrid}>
            {[
              ['Emergencies', data.summary?.totalEmergencyRequests],
              ['Ambulances', data.summary?.totalAmbulances],
              ['Hospitals', data.summary?.totalHospitals],
              ['Dispatches', data.summary?.totalDispatches]
            ].map(([label, value]) => <Metric key={label} label={label} value={value ?? '—'} />)}
          </View>
          <Text style={styles.sectionTitle}>Emergency requests</Text>
          {data.emergencies?.length
            ? data.emergencies.slice().reverse().map((item) => (
              <Card key={item.requestId}>
                <Text style={styles.cardTitle}>{item.patientName || 'Emergency'} · #{item.requestId}</Text>
                <Text style={styles.detail}>{item.emergencyType || 'Emergency'} · {item.priority || 'Priority not set'}</Text>
                <Text style={styles.detail}>Status: {item.status || 'Pending'}</Text>
                {item.status === 'Pending' ? (
                  <Button label="Dispatch nearest ambulance" onPress={() => dispatchAsAdmin(item)} />
                ) : null}
              </Card>
            ))
            : <Empty text="No emergency requests yet." />}
        </>
      )}

      {session.role === 'Hospital' && (
        <>
          <Text style={styles.sectionTitle}>Incoming emergencies</Text>
          {data.emergencies?.length
            ? data.emergencies.map((item) => (
              <Card key={item.requestId}>
                <Text style={styles.cardTitle}>{item.patientName || 'Emergency'} · #{item.requestId}</Text>
                <Text style={styles.detail}>{item.emergencyType || 'Emergency'} · {item.priority || 'Priority not set'}</Text>
                <Text style={styles.detail}>Status: {item.status || 'Pending'}</Text>
                <Button label="Accept and assign ambulance" onPress={() => acceptEmergency(item)} />
              </Card>
            ))
            : <Empty text="No nearby pending emergencies." />}
          <Text style={styles.sectionTitle}>Active dispatch</Text>
          {data.active ? (
            <Card>
              <Text style={styles.cardTitle}>{data.active.patient?.patientName || 'Emergency'} · #{data.active.requestId}</Text>
              <Text style={styles.detail}>{data.active.emergencyType || data.active.patient?.emergencyType} · {data.active.status}</Text>
              <Text style={styles.detail}>Ambulance: {data.active.ambulance?.vehicleNumber || data.active.ambulanceId}</Text>
              {data.active.report ? <Text style={styles.detail}>Vitals: HR {data.active.report.heartRate}, BP {data.active.report.bloodPressure}, SpO2 {data.active.report.spo2}%</Text> : null}
            </Card>
          ) : <Empty text="No active dispatches." />}
          <Text style={styles.sectionTitle}>Hospital fleet</Text>
          {data.fleet?.map((item) => (
            <Card key={item.ambulanceId}>
              <Text style={styles.cardTitle}>{item.vehicleNumber || `Ambulance ${item.ambulanceId}`}</Text>
              <Text style={styles.detail}>{item.driverName} · {item.status || 'Unknown status'}</Text>
            </Card>
          ))}
          <AddAmbulanceForm onSubmit={addAmbulance} />
        </>
      )}

      {session.role === 'Driver' && (
        <>
          <View style={styles.gpsCard}>
            <View style={styles.headerCopy}>
              <Text style={styles.cardTitle}>Ambulance #{session.ambulanceId}</Text>
              <Text style={styles.detail}>{gpsActive ? 'Live GPS sharing is active' : 'GPS sharing is paused'}</Text>
            </View>
            <Button label={gpsActive ? 'Stop GPS' : 'Start GPS'} onPress={toggleGps} />
          </View>
          {data.active ? (
            <Card>
              <Text style={styles.eyebrow}>ACTIVE MISSION · {data.active.status}</Text>
              <Text style={styles.cardTitle}>{data.active.patient?.patientName || 'Emergency patient'}</Text>
              <Text style={styles.detail}>{data.active.patient?.emergencyType || 'Emergency'}</Text>
              <Text style={styles.detail}>{data.active.patient?.address || 'Location shared with dispatch'}</Text>
              {data.active.patient?.patientPhone ? (
                <Button label="Call patient" onPress={() => Linking.openURL(`tel:${data.active.patient.patientPhone}`)} />
              ) : null}
              {data.active.patient?.latitude != null && data.active.patient?.longitude != null ? (
                <Button
                  label="Navigate to patient"
                  onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${data.active.patient.latitude},${data.active.patient.longitude}`)}
                />
              ) : null}
              <Text style={styles.sectionTitle}>Update mission</Text>
              <View style={styles.actionGrid}>
                {['En Route', 'Arrived', 'Transporting', 'Completed'].map((status) => (
                  <Button key={status} label={status} onPress={() => updateDispatchStatus(status)} />
                ))}
              </View>
              <Text style={styles.sectionTitle}>Send patient vitals</Text>
              <TextInput style={styles.input} value={vitals.heartRate} onChangeText={(value) => setVitals((current) => ({ ...current, heartRate: value }))} placeholder="Heart rate (BPM)" placeholderTextColor="#91a0b4" keyboardType="number-pad" />
              <TextInput style={styles.input} value={vitals.bloodPressure} onChangeText={(value) => setVitals((current) => ({ ...current, bloodPressure: value }))} placeholder="Blood pressure (128/84)" placeholderTextColor="#91a0b4" keyboardType="numbers-and-punctuation" />
              <TextInput style={styles.input} value={vitals.spo2} onChangeText={(value) => setVitals((current) => ({ ...current, spo2: value }))} placeholder="SpO2 (%)" placeholderTextColor="#91a0b4" keyboardType="number-pad" />
              <Button label="Send vitals to ER" onPress={sendVitals} />
            </Card>
          ) : <Empty text="You are signed in and ready. An assigned emergency will appear here." />}
        </>
      )}
    </ScrollView>
  );
}

function AddAmbulanceForm({ onSubmit }) {
  const [fields, setFields] = useState({ vehicleNumber: '', driverName: '', driverPhone: '', password: '' });
  function update(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }
  return (
    <Card>
      <Text style={styles.cardTitle}>Add ambulance and driver</Text>
      <TextInput style={styles.input} value={fields.vehicleNumber} onChangeText={(value) => update('vehicleNumber', value)} placeholder="Vehicle number" placeholderTextColor="#91a0b4" autoCapitalize="characters" />
      <TextInput style={styles.input} value={fields.driverName} onChangeText={(value) => update('driverName', value)} placeholder="Driver name" placeholderTextColor="#91a0b4" />
      <TextInput style={styles.input} value={fields.driverPhone} onChangeText={(value) => update('driverPhone', value)} placeholder="Driver phone" placeholderTextColor="#91a0b4" keyboardType="phone-pad" />
      <TextInput style={styles.input} value={fields.password} onChangeText={(value) => update('password', value)} placeholder="Driver password (12+ characters)" placeholderTextColor="#91a0b4" secureTextEntry />
      <Button label="Add to fleet" onPress={() => onSubmit(fields)} />
    </Card>
  );
}

function Card({ children }) {
  return <View style={styles.card}>{children}</View>;
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Button({ label, onPress }) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Empty({ text }) {
  return <View style={styles.empty}><Text style={styles.detail}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 18, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#38bdf8', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 5 },
  title: { color: palette.text, fontSize: 26, fontWeight: '900' },
  signOut: { backgroundColor: '#7f1d1d', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginLeft: 8 },
  signOutText: { color: palette.text, fontWeight: '800', fontSize: 12 },
  notice: { color: '#fcd34d', backgroundColor: '#31240d', padding: 12, borderRadius: 10, lineHeight: 19, marginBottom: 10 },
  refresh: { alignItems: 'center', justifyContent: 'center', minHeight: 44, backgroundColor: palette.panelAlt, borderRadius: 11, marginBottom: 10 },
  sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 17, marginBottom: 9 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metric: { flexBasis: '48%', flexGrow: 1, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, borderRadius: 14, padding: 15 },
  metricValue: { color: palette.text, fontSize: 24, fontWeight: '900' },
  metricLabel: { color: palette.muted, fontSize: 12, marginTop: 3 },
  card: { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, borderRadius: 15, padding: 15, marginBottom: 10 },
  cardTitle: { color: palette.text, fontSize: 16, fontWeight: '800', marginBottom: 5 },
  detail: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  button: { backgroundColor: palette.blue, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: palette.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  empty: { borderWidth: 1, borderColor: palette.border, borderStyle: 'dashed', borderRadius: 13, padding: 17, marginBottom: 10 },
  gpsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.panel, borderRadius: 15, borderColor: palette.border, borderWidth: 1, padding: 14 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  input: { backgroundColor: palette.panelAlt, color: palette.text, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, marginTop: 9, fontSize: 14 }
});
