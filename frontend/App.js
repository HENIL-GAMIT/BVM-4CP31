import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import NativeRoleDashboard from './NativeRoleDashboard';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

// The web build uses the operations console; Android and iOS use native screens.
import DesktopApp from './src/App';

function getDefaultApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredUrl) return normalizeApiUrl(configuredUrl);

  const host = getExpoHost();
  return host ? `http://${host}:5000` : '';
}

function getExpoHost() {
  const expoHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  return expoHost?.split(':')[0];
}

function normalizeApiUrl(value) {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return '';
    const expoHost = getExpoHost();
    if (expoHost && (parsed.hostname === '0.0.0.0' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      parsed.hostname = expoHost;
      return parsed.toString().replace(/\/$/, '');
    }
    if (parsed.hostname === '0.0.0.0' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return '';
    }
  } catch {
    return '';
  }
  return trimmed;
}

const defaultApiUrl = getDefaultApiUrl();

export default function App() {
  if (Platform.OS === 'web') return <DesktopApp />;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [showLogin, setShowLogin] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [session, setSession] = useState(null);
  const effectiveApiUrl = normalizeApiUrl(apiUrl) || defaultApiUrl;

  async function signIn() {
    if (!effectiveApiUrl) {
      setLoginMessage('Configure the backend address before signing in.');
      return;
    }
    if (!identifier.trim() || !password) {
      setLoginMessage('Enter your email or phone number and password.');
      return;
    }

    setLoginLoading(true);
    setLoginMessage('');
    const loginOptions = [
      {
        role: 'Admin',
        path: '/api/auth/login',
        body: { email: identifier.trim(), password }
      },
      {
        role: 'Hospital',
        path: '/api/auth/hospital-login',
        body: { phone: identifier.trim(), password }
      },
      {
        role: 'Driver',
        path: '/api/auth/driver-login',
        body: { phone: identifier.trim(), password }
      }
    ];

    try {
      for (const option of loginOptions) {
        const response = await fetch(`${effectiveApiUrl}${option.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(option.body)
        });
        if (response.ok) {
          const result = await response.json();
          if (!result.token || (option.role === 'Admin' && result.role !== 'Admin') ||
              (option.role === 'Hospital' && result.hospitalId == null) ||
              (option.role === 'Driver' && result.ambulanceId == null)) {
            throw new Error('The server returned an incomplete sign-in session.');
          }
          setSession({ ...result, role: option.role });
          setShowLogin(false);
          setIdentifier('');
          setPassword('');
          return;
        }
        if (response.status === 401 || response.status === 403) continue;
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || `Sign in failed (HTTP ${response.status}).`);
        }
      }
      setLoginMessage('Invalid email or phone number, or password. Check your credentials and try again.');
    } catch (error) {
      setLoginMessage(error.message || `Could not reach ${effectiveApiUrl}. Check the backend connection.`);
    } finally {
      setLoginLoading(false);
    }
  }

  if (scanning) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <View style={styles.scannerHeader}>
            <Text style={styles.kicker}>BACKEND CONNECTION</Text>
            <Text style={styles.title}>Connect to dispatch</Text>
            <Text style={styles.subtitle}>Scan a backend QR code or enter the backend URL for this mobile UI.</Text>
          </View>
          <ConnectionScanner
            permission={permission}
            requestPermission={requestPermission}
            apiUrl={apiUrl}
            onApiUrlChange={setApiUrl}
            onConnect={(url) => {
              setApiUrl(url);
              setScanning(false);
            }}
            onInvalidUrl={() => setLoginMessage('Enter or scan a valid backend URL, including http:// or https://.')}
          />
          <Text style={styles.helper}>On the same Wi-Fi, scan or enter URL such as http://192.168.1.10:5000</Text>
          <Pressable style={styles.linkButton} onPress={() => {
            setScanning(false);
          }}>
            <Text style={styles.link}>Back to emergency home</Text>
          </Pressable>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        {session ? (
          <NativeRoleDashboard
            key={`${session.role}-${session.hospitalId || session.ambulanceId || 'admin'}`}
            apiUrl={effectiveApiUrl}
            session={session}
            onSignOut={() => setSession(null)}
          />
        ) : showLogin ? (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.kicker}>SECURE ACCESS</Text>
                  <Text style={styles.title}>Sign in</Text>
                </View>
                <Pressable onPress={() => setScanning(true)}>
                  <Text style={styles.link}>Config</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>Use your registered email or phone number. Your dashboard opens automatically after sign in.</Text>
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="Email or phone number"
                  placeholderTextColor="#8a93a3"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="username"
                />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#8a93a3"
                  secureTextEntry
                  autoComplete="password"
                  onSubmitEditing={signIn}
                />
                <Pressable style={styles.primaryButton} onPress={signIn} disabled={loginLoading}>
                  {loginLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Sign in securely</Text>}
                </Pressable>
                {loginMessage ? <Text style={styles.message}>{loginMessage}</Text> : null}
                <Pressable style={styles.linkButton} onPress={() => { setShowLogin(false); setLoginMessage(''); }}>
                  <Text style={styles.link}>Back to emergency home</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <EmergencyScreen
            apiUrl={effectiveApiUrl}
            onRescan={() => setScanning(true)}
            onSignIn={() => setShowLogin(true)}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function ConnectionScanner({ permission, requestPermission, apiUrl, onApiUrlChange, onConnect, onInvalidUrl }) {
  function connect(value) {
    const normalizedUrl = normalizeApiUrl(value);
    if (!normalizedUrl) {
      onInvalidUrl();
      return;
    }
    onConnect(normalizedUrl);
  }

  return (
    <>
      <View style={styles.scannerFrame}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (data) connect(data);
            }}
          />
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Camera access is needed to scan the connection QR.</Text>
            <Pressable style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Allow camera</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.scanCorners} />
      </View>
      <TextInput
        style={styles.urlInput}
        value={apiUrl}
        onChangeText={onApiUrlChange}
        placeholder="Or enter backend URL (http://10.x.x.x:5000)"
        placeholderTextColor="#8a93a3"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Pressable style={styles.secondaryButton} onPress={() => connect(apiUrl)}>
        <Text style={styles.secondaryButtonText}>Continue with URL</Text>
      </Pressable>
    </>
  );
}

/* =================================================================
   EMERGENCY PATIENT SCREEN (Native Mobile)
   ================================================================= */
function EmergencyScreen({ apiUrl, onRescan, onSignIn }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('Accident');
  const [priority, setPriority] = useState('Critical');
  const [location, setLocation] = useState(null);
  const [message, setMessage] = useState(apiUrl ? 'Connecting to dispatch services...' : 'Configure the backend address to submit an emergency.');
  const [activeRequest, setActiveRequest] = useState(null);
  const [tracking, setTracking] = useState(null);

  useEffect(() => {
    let active = true;
    if (!apiUrl) {
      setMessage('Enter your backend URL, for example http://192.168.1.10:5000.');
      return () => { active = false; };
    }
    fetch(`${apiUrl}/api/health`)
      .then((response) => {
        if (!active) return;
        setMessage(response.ok ? `Connected to ${apiUrl}` : `Backend returned HTTP ${response.status}`);
      })
      .catch(() => {
        if (active) setMessage(`Cannot reach ${apiUrl}. Keep the backend running and use the same Wi-Fi.`);
      });
    return () => { active = false; };
  }, [apiUrl]);

  // Live polling of incoming ambulance for the requester
  useEffect(() => {
    if (!activeRequest?.requestId || !apiUrl) return undefined;
    let active = true;
    async function pollTracking() {
      try {
        const res = await fetch(`${apiUrl}/api/tracking/request/${activeRequest.requestId}`, {
          headers: { 'X-Request-Token': activeRequest.requestToken || '' }
        });
        if (res.ok && active) {
          const data = await res.json();
          setTracking(data);
          if (data.ambulance) {
            setMessage(`Ambulance #${data.ambulance.vehicleNumber} is on the way (${data.dispatch?.status || 'En Route'})`);
          }
        }
      } catch (e) {
        // silent
      }
    }
    pollTracking();
    const interval = setInterval(pollTracking, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeRequest, apiUrl]);

  async function getLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setMessage('Location permission is required to request an ambulance.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({});
    setLocation(current.coords);
    setMessage('Location captured. Ready to dispatch.');
  }

  async function submitRequest() {
    if (!location) {
      setMessage('Share your location before requesting an ambulance.');
      return;
    }
    try {
      const response = await fetch(`${apiUrl}/api/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: name.trim() || 'Emergency Patient',
          patientPhone: phone.trim(),
          emergencyType: type,
          priority,
          latitude: location.latitude,
          longitude: location.longitude,
          address: ''
        }),
      });
      if (!response.ok) throw new Error('Request failed');
      const req = await response.json();
      setActiveRequest(req);
      setMessage(`Request #${req.requestId} submitted. Searching for nearest hospital...`);
    } catch {
      setMessage(`Could not reach ${apiUrl}. Check Wi-Fi and backend server.`);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>EMERGENCY DISPATCH</Text>
            <Text style={styles.title}>Need urgent help?</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={onRescan}><Text style={styles.link}>Config</Text></Pressable>
            <Pressable style={styles.loginButton} onPress={onSignIn}><Text style={styles.loginButtonText}>Sign in</Text></Pressable>
          </View>
        </View>
        <Text style={styles.subtitle}>Instant emergency ambulance dispatch with live tracking.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Emergency type</Text>
          <View style={styles.choiceRow}>
            {['Accident', 'Medical', 'Cardiac'].map((item) => (
              <Choice key={item} label={item} active={type === item} onPress={() => setType(item)} />
            ))}
          </View>

          <Text style={styles.label}>Priority</Text>
          <View style={styles.choiceRow}>
            {['Critical', 'High', 'Normal'].map((item) => (
              <Choice key={item} label={item} active={priority === item} onPress={() => setPriority(item)} />
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Patient name"
            placeholderTextColor="#8a93a3"
          />
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Contact phone number"
            placeholderTextColor="#8a93a3"
            keyboardType="phone-pad"
          />

          <Pressable style={styles.secondaryButton} onPress={getLocation}>
            <Text style={styles.secondaryButtonText}>
              {location ? '✓ GPS Location Captured' : '📍 Capture My GPS Location'}
            </Text>
          </Pressable>
          <Text style={styles.locationText}>
            {location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : 'GPS location is required'}
          </Text>

          <Pressable style={styles.dangerButton} onPress={submitRequest}>
            <Text style={styles.primaryButtonText}>🚨 Request Ambulance</Text>
          </Pressable>

          <Pressable style={styles.callButton} onPress={() => Linking.openURL('tel:108')}>
            <Text style={styles.callText}>📞 Call National Helpline 108</Text>
          </Pressable>

          <Text style={styles.message}>{message}</Text>

          {/* Incoming Dispatched Ambulance Card */}
          {tracking?.ambulance && (
            <View style={styles.trackingCard}>
              <View style={styles.trackingCardHeader}>
                <Text style={styles.trackingKicker}>AMBULANCE EN ROUTE</Text>
                <Text style={styles.trackingStatusBadge}>
                  {tracking.dispatch?.status || 'Dispatched'}
                </Text>
              </View>

              <Text style={styles.trackingTitle}>
                Ambulance #{tracking.ambulance.vehicleNumber}
              </Text>
              <Text style={styles.trackingSub}>
                Driver: {tracking.ambulance.driverName || 'Assigned Emergency Driver'}
              </Text>

              {tracking.ambulance.driverPhone && (
                <Pressable
                  style={styles.driverCallButton}
                  onPress={() => Linking.openURL(`tel:${tracking.ambulance.driverPhone}`)}
                >
                  <Text style={styles.driverCallButtonText}>
                    📞 Call Driver ({tracking.ambulance.driverPhone})
                  </Text>
                </Pressable>
              )}

              {tracking.hospital && (
                <Text style={styles.hospitalNote}>
                  Destination: {tracking.hospital.hospitalName}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* =================================================================
   DRIVER PORTAL SCREEN (Native Mobile for Smartphone Drivers)
   ================================================================= */
function DriverMobileScreen({ apiUrl, onRescan }) {
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [token, setToken] = useState('');
  const [ambulanceId, setAmbulanceId] = useState('');
  const [activeDispatch, setActiveDispatch] = useState(null);
  const [patientDetails, setPatientDetails] = useState(null);
  const [hospitalDetails, setHospitalDetails] = useState(null);
  const [vitals, setVitals] = useState({ heartRate: '108', bloodPressure: '128/84', spo2: '95' });
  const [vitalsMessage, setVitalsMessage] = useState('');
  const [sendingVitals, setSendingVitals] = useState(false);
  const [isBroadcastingGps, setIsBroadcastingGps] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [driverStatusMsg, setDriverStatusMsg] = useState('');

  const locationSubscription = useRef(null);
  const pollTimer = useRef(null);

  async function handleDriverLogin(phoneVal = driverPhone, plateVal = vehicleNumber) {
    if (!phoneVal || !plateVal) {
      Alert.alert('Missing Fields', 'Please enter your phone number and vehicle plate.');
      return;
    }
    setLoading(true);
    setDriverStatusMsg('Signing in...');
    try {
      const res = await fetch(`${apiUrl}/api/auth/driver-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneVal.trim(), vehicleNumber: plateVal.trim() })
      });
      if (!res.ok) {
        const text = await res.text();
        Alert.alert('Login Failed', text || 'Please check your phone and vehicle number.');
        setDriverStatusMsg('Login failed.');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setToken(data.token);
      setAmbulanceId(String(data.ambulanceId));
      setDriverStatusMsg('Connected online.');
      loadMissions(data.ambulanceId, data.token);
    } catch {
      Alert.alert('Network Error', `Could not reach ${apiUrl}. Keep backend running.`);
      setDriverStatusMsg('Connection failed.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMissions(ambId = ambulanceId, authToken = token) {
    if (!ambId || !authToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/dispatch/ambulance/${ambId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const list = await res.json();
        const ongoing = list.find((d) => d.status !== 'Completed') || list[0];
        if (ongoing) {
          setActiveDispatch(ongoing);
          fetchMissionEntities(ongoing, authToken);
        }
      }
    } catch (err) {
      // silent
    }
  }

  async function fetchMissionEntities(dispatch, authToken) {
    try {
      const [reqRes, hospRes] = await Promise.all([
        fetch(`${apiUrl}/api/emergency/${dispatch.requestId}`, { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch(`${apiUrl}/api/hospitals/${dispatch.hospitalId}`, { headers: { Authorization: `Bearer ${authToken}` } })
      ]);
      if (reqRes.ok) setPatientDetails(await reqRes.json());
      if (hospRes.ok) setHospitalDetails(await hospRes.json());
    } catch {
      // silent
    }
  }

  // Poll dispatches periodically when logged in
  useEffect(() => {
    if (ambulanceId && token) {
      loadMissions();
      pollTimer.current = setInterval(() => loadMissions(), 5000);
      return () => clearInterval(pollTimer.current);
    }
  }, [ambulanceId, token]);

  async function toggleGpsBroadcast() {
    if (isBroadcastingGps) {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      setIsBroadcastingGps(false);
      setDriverStatusMsg('GPS broadcasting paused.');
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('GPS Permission Required', 'Allow location permission to broadcast ambulance coordinates.');
      return;
    }

    setIsBroadcastingGps(true);
    setDriverStatusMsg('🟢 Broadcasting live GPS to patients.');

    try {
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 5
        },
        async (loc) => {
          const { latitude, longitude, accuracy } = loc.coords;
          setGpsCoords({ latitude, longitude, accuracy });
          await fetch(`${apiUrl}/api/ambulances/${ambulanceId}/location?latitude=${latitude}&longitude=${longitude}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => null);
        }
      );
    } catch (e) {
      Alert.alert('GPS Error', 'Could not start location tracker.');
      setIsBroadcastingGps(false);
    }
  }

  async function updateStatus(newStatus) {
    if (!activeDispatch) return;
    try {
      const res = await fetch(`${apiUrl}/api/dispatch/${activeDispatch.dispatchId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        loadMissions();
      } else {
        Alert.alert('Update Failed', 'Could not update mission status.');
      }
    } catch {
      Alert.alert('Network Error', 'Check connection.');
    }
  }

  async function sendPatientVitals() {
    if (!activeDispatch?.dispatchId || !token) {
      setVitalsMessage('An active mission and valid driver session are required.');
      return;
    }

    const heartRate = Number(vitals.heartRate);
    const spo2 = Number(vitals.spo2.replace('%', '').trim());
    if (!Number.isInteger(heartRate) || heartRate < 1 || heartRate > 300 ||
        !Number.isInteger(spo2) || spo2 < 0 || spo2 > 100 ||
        !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(vitals.bloodPressure)) {
      setVitalsMessage('Enter valid heart rate, blood pressure (for example 128/84), and SpO2.');
      return;
    }

    setSendingVitals(true);
    setVitalsMessage('');
    try {
      const res = await fetch(`${apiUrl}/api/dispatch/${activeDispatch.dispatchId}/vitals`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heartRate,
          bloodPressure: vitals.bloodPressure.trim(),
          spo2
        })
      });
      if (!res.ok) {
        const detail = await res.text();
        setVitalsMessage(detail || `Vitals were not sent (HTTP ${res.status}).`);
        return;
      }
      setVitalsMessage('Patient vitals sent to the assigned hospital ER.');
    } catch {
      setVitalsMessage(`Could not reach ${apiUrl}. Patient vitals were not sent.`);
    } finally {
      setSendingVitals(false);
    }
  }

  function handleLogout() {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (pollTimer.current) clearInterval(pollTimer.current);
    setToken('');
    setAmbulanceId('');
    setActiveDispatch(null);
    setIsBroadcastingGps(false);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        {!token ? (
          /* Driver Mobile Sign In Screen */
          <View>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.kicker}>AMBULANCE CREW</Text>
                <Text style={styles.title}>Driver Portal</Text>
              </View>
              <Pressable onPress={onRescan}>
                <Text style={styles.link}>Config</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>Sign in on your phone to receive live emergency missions and broadcast your ambulance GPS.</Text>

            <View style={styles.form}>
              <Text style={styles.label}>Driver phone number</Text>
              <TextInput
                style={styles.input}
                value={driverPhone}
                onChangeText={setDriverPhone}
                placeholder="e.g. 9999999999"
                placeholderTextColor="#8a93a3"
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Vehicle plate number</Text>
              <TextInput
                style={styles.input}
                value={vehicleNumber}
                onChangeText={(t) => setVehicleNumber(t.toUpperCase())}
                placeholder="e.g. GJ-01-DEM"
                placeholderTextColor="#8a93a3"
                autoCapitalize="characters"
              />

              <Pressable
                style={styles.primaryButton}
                onPress={() => handleDriverLogin()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Sign In to Ambulance</Text>
                )}
              </Pressable>

              {driverStatusMsg ? <Text style={styles.message}>{driverStatusMsg}</Text> : null}
            </View>
          </View>
        ) : (
          /* Driver Logged-In Mobile Dashboard */
          <View>
            <View style={styles.driverHeader}>
              <View>
                <Text style={styles.driverBadge}>🚑 Ambulance #{ambulanceId}</Text>
                <Text style={styles.driverOnlineTag}>● Active on Duty</Text>
              </View>
              <Pressable style={styles.driverSignOutBtn} onPress={handleLogout}>
                <Text style={styles.driverSignOutText}>Sign out</Text>
              </Pressable>
            </View>

            {/* One-Tap GPS Broadcast Card */}
            <View style={styles.gpsCard}>
              <View style={styles.gpsInfo}>
                <Text style={styles.gpsTitle}>
                  {isBroadcastingGps ? '🟢 Live GPS Broadcasting' : 'GPS Broadcast Paused'}
                </Text>
                <Text style={styles.gpsSubtitle}>
                  {isBroadcastingGps && gpsCoords
                    ? `${gpsCoords.latitude.toFixed(5)}, ${gpsCoords.longitude.toFixed(5)} (±${Math.round(gpsCoords.accuracy || 0)}m)`
                    : 'Patients cannot track your ambulance until you start GPS.'}
                </Text>
              </View>
              <Pressable
                style={[styles.gpsToggleBtn, isBroadcastingGps && styles.gpsToggleBtnActive]}
                onPress={toggleGpsBroadcast}
              >
                <Text style={styles.gpsToggleText}>
                  {isBroadcastingGps ? 'Stop GPS' : 'Start GPS'}
                </Text>
              </Pressable>
            </View>

            {/* Active Mission Card */}
            {activeDispatch && patientDetails ? (
              <View style={styles.missionCard}>
                <View style={styles.missionCardHeader}>
                  <Text style={styles.missionKicker}>ACTIVE EMERGENCY MISSION</Text>
                  <Text style={styles.missionPriorityPill}>
                    {patientDetails.priority || 'Critical'} Priority
                  </Text>
                </View>

                <Text style={styles.missionPatientName}>
                  {patientDetails.patientName || 'Emergency Patient'}
                </Text>
                <Text style={styles.missionIncident}>
                  Incident: {patientDetails.emergencyType || 'Accident'}
                </Text>

                {/* Primary Touch Actions for Driver */}
                <View style={styles.actionRow}>
                  {patientDetails.patientPhone ? (
                    <Pressable
                      style={styles.actionCallBtn}
                      onPress={() => Linking.openURL(`tel:${patientDetails.patientPhone}`)}
                    >
                      <Text style={styles.actionBtnText}>
                        📞 Call Patient ({patientDetails.patientPhone})
                      </Text>
                    </Pressable>
                  ) : null}

                  {patientDetails.latitude && patientDetails.longitude ? (
                    <Pressable
                      style={styles.actionNavBtn}
                      onPress={() =>
                        Linking.openURL(
                          `https://www.google.com/maps/dir/?api=1&destination=${patientDetails.latitude},${patientDetails.longitude}`
                        )
                      }
                    >
                      <Text style={styles.actionBtnText}>
                        🗺️ Navigate in Google Maps
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* Destination Hospital */}
                {hospitalDetails && (
                  <View style={styles.hospitalCard}>
                    <Text style={styles.hospitalLabel}>DESTINATION HOSPITAL</Text>
                    <Text style={styles.hospitalName}>{hospitalDetails.hospitalName}</Text>
                    <Text style={styles.hospitalAddress}>{hospitalDetails.address}</Text>
                    {hospitalDetails.latitude && hospitalDetails.longitude ? (
                      <Pressable
                        onPress={() =>
                          Linking.openURL(
                            `https://www.google.com/maps/dir/?api=1&destination=${hospitalDetails.latitude},${hospitalDetails.longitude}`
                          )
                        }
                      >
                        <Text style={styles.hospitalNavText}>
                          🏥 Navigate to Hospital in Maps
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                {/* Mission Status Progression */}
                <Text style={styles.statusSectionLabel}>Update Mission Status:</Text>
                <View style={styles.statusGrid}>
                  {['En Route', 'Arrived', 'Transporting', 'Completed'].map((st) => {
                    const isCurrent = activeDispatch.status === st;
                    return (
                      <Pressable
                        key={st}
                        style={[styles.statusBtn, isCurrent && styles.statusBtnCurrent]}
                        onPress={() => updateStatus(st)}
                      >
                        <Text style={[styles.statusBtnText, isCurrent && styles.statusBtnTextCurrent]}>
                          {st === 'Completed' ? '✅ Complete' : st}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.mobileVitalsCard}>
                  <Text style={styles.statusSectionLabel}>Send Patient Vitals to Hospital ER</Text>
                  <TextInput
                    style={styles.input}
                    value={vitals.heartRate}
                    onChangeText={(value) => setVitals((current) => ({ ...current, heartRate: value }))}
                    placeholder="Heart rate (BPM)"
                    placeholderTextColor="#8a93a3"
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={styles.input}
                    value={vitals.bloodPressure}
                    onChangeText={(value) => setVitals((current) => ({ ...current, bloodPressure: value }))}
                    placeholder="Blood pressure (128/84)"
                    placeholderTextColor="#8a93a3"
                    keyboardType="numbers-and-punctuation"
                  />
                  <TextInput
                    style={styles.input}
                    value={vitals.spo2}
                    onChangeText={(value) => setVitals((current) => ({ ...current, spo2: value }))}
                    placeholder="SpO2 (%)"
                    placeholderTextColor="#8a93a3"
                    keyboardType="number-pad"
                  />
                  <Pressable style={styles.primaryButton} onPress={sendPatientVitals} disabled={sendingVitals}>
                    {sendingVitals ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>📡 Send Vitals to ER</Text>}
                  </Pressable>
                  {vitalsMessage ? <Text style={styles.message}>{vitalsMessage}</Text> : null}
                </View>
              </View>
            ) : (
              <View style={styles.emptyMissionCard}>
                <Text style={styles.emptyIcon}>🚑</Text>
                <Text style={styles.emptyTitle}>Ready for Assignments</Text>
                <Text style={styles.emptySub}>
                  You are online. When an emergency is assigned to Ambulance #{ambulanceId}, patient details and turn-by-turn navigation will appear here.
                </Text>
                <Pressable style={styles.secondaryButton} onPress={() => loadMissions()}>
                  <Text style={styles.secondaryButtonText}>🔄 Check for Missions</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Choice({ label, active, onPress }) {
  return (
    <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

/* =================================================================
   NATIVE MOBILE STYLES
   ================================================================= */
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#07111f' },
  content: { padding: 20, paddingBottom: 48 },
  modeLaunchButton: { marginHorizontal: 20, marginTop: 14 },
  linkButton: { alignItems: 'center', padding: 14, marginTop: 4 },

  // Top Mobile Role Switcher
  modeTabBar: {
    flexDirection: 'row',
    backgroundColor: '#111d2e',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10
  },
  modeTabActive: {
    backgroundColor: '#2563eb'
  },
  modeTabText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700'
  },
  modeTabTextActive: {
    color: '#ffffff'
  },

  scannerHeader: { padding: 24, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { color: '#f97316', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginTop: 6 },
  subtitle: { color: '#a8b3c5', fontSize: 14, lineHeight: 22, marginTop: 8 },

  scannerFrame: {
    height: 280,
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#152338',
    justifyContent: 'center',
    alignItems: 'center'
  },
  scanCorners: { width: 190, height: 190, borderColor: '#fb923c', borderWidth: 3, borderRadius: 20 },
  permissionBox: { padding: 24, alignItems: 'center' },
  permissionText: { color: '#e2e8f0', textAlign: 'center', marginBottom: 16, lineHeight: 22 },
  helper: { color: '#a8b3c5', textAlign: 'center', margin: 18, lineHeight: 20, fontSize: 13 },
  urlInput: {
    marginHorizontal: 20,
    backgroundColor: '#142237',
    color: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    fontSize: 14
  },

  form: { backgroundColor: '#102035', borderRadius: 20, padding: 18, marginTop: 20 },
  label: { color: '#cbd5e1', fontWeight: '700', marginBottom: 8, marginTop: 8, fontSize: 12, textTransform: 'uppercase' },
  choiceRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  choice: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#30445d', paddingVertical: 10, alignItems: 'center' },
  choiceActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  choiceText: { color: '#cbd5e1', fontWeight: '700', fontSize: 13 },
  choiceTextActive: { color: '#fff' },

  input: { backgroundColor: '#172a42', color: '#f8fafc', borderRadius: 10, padding: 14, marginTop: 6, fontSize: 14 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  primaryButtonText: { color: '#fff', fontWeight: '800', textAlign: 'center', fontSize: 15 },
  secondaryButton: { backgroundColor: '#223854', borderRadius: 10, padding: 14, marginTop: 12 },
  secondaryButtonText: { color: '#f8fafc', textAlign: 'center', fontWeight: '800', fontSize: 13 },
  dangerButton: { backgroundColor: '#dc2626', borderRadius: 12, padding: 15, marginTop: 16 },
  callButton: { padding: 12, marginTop: 4 },
  callText: { color: '#fb923c', textAlign: 'center', fontWeight: '800', fontSize: 13 },
  locationText: { color: '#94a3b8', fontSize: 12, marginTop: 6 },
  message: { color: '#fbbf24', textAlign: 'center', lineHeight: 20, marginTop: 14, fontSize: 13 },
  link: { color: '#38bdf8', fontWeight: '800', marginTop: 6, fontSize: 13 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loginButton: { backgroundColor: '#dc2626', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  loginButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Dispatched Ambulance Card in Emergency
  trackingCard: {
    marginTop: 18,
    padding: 16,
    backgroundColor: '#172a42',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#38bdf8'
  },
  trackingCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trackingKicker: { color: '#38bdf8', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  trackingStatusBadge: { backgroundColor: '#0284c7', color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  trackingTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 6 },
  trackingSub: { color: '#cbd5e1', fontSize: 13, marginTop: 2 },
  driverCallButton: { backgroundColor: '#16a34a', borderRadius: 10, padding: 12, marginTop: 12 },
  driverCallButtonText: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 14 },
  hospitalNote: { color: '#94a3b8', fontSize: 12, marginTop: 8 },

  // Driver Mobile Dashboard Styles
  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#102035',
    padding: 16,
    borderRadius: 16,
    marginBottom: 14
  },
  driverBadge: { color: '#fff', fontSize: 17, fontWeight: '800' },
  driverOnlineTag: { color: '#4ade80', fontSize: 12, fontWeight: '700', marginTop: 2 },
  driverSignOutBtn: { backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  driverSignOutText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  gpsCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  gpsInfo: { flex: 1, marginRight: 10 },
  gpsTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  gpsSubtitle: { color: '#94a3b8', fontSize: 11, marginTop: 3, lineHeight: 16 },
  gpsToggleBtn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  gpsToggleBtnActive: { backgroundColor: '#475569' },
  gpsToggleText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  missionCard: {
    backgroundColor: '#102035',
    borderWidth: 1.5,
    borderColor: '#2563eb',
    borderRadius: 18,
    padding: 18
  },
  mobileVitalsCard: {
    backgroundColor: '#172a42',
    borderRadius: 14,
    padding: 14,
    marginTop: 18
  },
  missionCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  missionKicker: { color: '#38bdf8', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  missionPriorityPill: { backgroundColor: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  missionPatientName: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 8 },
  missionIncident: { color: '#94a3b8', fontSize: 13, marginBottom: 14 },

  actionRow: { gap: 10, marginBottom: 14 },
  actionCallBtn: { backgroundColor: '#16a34a', padding: 14, borderRadius: 12 },
  actionNavBtn: { backgroundColor: '#2563eb', padding: 14, borderRadius: 12 },
  actionBtnText: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 14 },

  hospitalCard: { backgroundColor: '#172a42', padding: 12, borderRadius: 12, marginBottom: 16 },
  hospitalLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hospitalName: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 2 },
  hospitalAddress: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
  hospitalNavText: { color: '#38bdf8', fontSize: 12, fontWeight: '800', marginTop: 6, textDecorationLine: 'underline' },

  statusSectionLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { flexBasis: '48%', backgroundColor: '#1c2e47', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  statusBtnCurrent: { backgroundColor: '#2563eb' },
  statusBtnText: { color: '#cbd5e1', fontWeight: '700', fontSize: 12 },
  statusBtnTextCurrent: { color: '#fff', fontWeight: '800' },

  emptyMissionCard: { backgroundColor: '#102035', borderRadius: 18, padding: 24, alignItems: 'center' },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  emptySub: { color: '#94a3b8', textAlign: 'center', fontSize: 13, lineHeight: 19, marginVertical: 12 }
});