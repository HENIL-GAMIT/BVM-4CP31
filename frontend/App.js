import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
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

// The web build uses the operations console; native builds keep the mobile emergency & driver flow.
import DesktopApp from './src/App';

function getDefaultApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

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
    const expoHost = getExpoHost();
    if (expoHost && (parsed.hostname === '0.0.0.0' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      parsed.hostname = expoHost;
      return parsed.toString().replace(/\/$/, '');
    }
    if (parsed.hostname === '0.0.0.0' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return '';
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

const defaultApiUrl = getDefaultApiUrl();

export default function App() {
  if (Platform.OS === 'web') return <DesktopApp />;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [apiUrl, setApiUrl] = useState('');
  const [status, setStatus] = useState('Scan the backend QR code to connect.');
  const [mobileMode, setMobileMode] = useState('emergency'); // 'emergency' | 'driver'

  if (scanning) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <View style={styles.scannerHeader}>
            <Text style={styles.kicker}>SMART DISPATCH MOBILE</Text>
            <Text style={styles.title}>Connect to dispatch</Text>
            <Text style={styles.subtitle}>Scan the QR code or enter your computer backend URL.</Text>
          </View>
          <View style={styles.scannerFrame}>
            {permission?.granted ? (
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (!data || apiUrl) return;
                  setApiUrl(normalizeApiUrl(data));
                  setScanning(false);
                  setStatus('Checking backend connection...');
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
          <Text style={styles.helper}>On the same Wi-Fi, scan or enter URL such as http://192.168.1.10:5000</Text>
          <TextInput
            style={styles.urlInput}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="Or enter backend URL (http://10.x.x.x:5000)"
            placeholderTextColor="#8a93a3"
            autoCapitalize="none"
            keyboardType="url"
          />
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              if (apiUrl.trim()) setScanning(false);
            }}
          >
            <Text style={styles.secondaryButtonText}>Continue with URL</Text>
          </Pressable>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const effectiveApiUrl = normalizeApiUrl(apiUrl) || defaultApiUrl;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        {/* Mobile Top Navigation: Switch between Patient Emergency and Driver Portal */}
        <View style={styles.modeTabBar}>
          <Pressable
            style={[styles.modeTab, mobileMode === 'emergency' && styles.modeTabActive]}
            onPress={() => setMobileMode('emergency')}
          >
            <Text style={[styles.modeTabText, mobileMode === 'emergency' && styles.modeTabTextActive]}>
              🚨 Patient Emergency
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeTab, mobileMode === 'driver' && styles.modeTabActive]}
            onPress={() => setMobileMode('driver')}
          >
            <Text style={[styles.modeTabText, mobileMode === 'driver' && styles.modeTabTextActive]}>
              🚑 Driver Portal
            </Text>
          </Pressable>
        </View>

        {mobileMode === 'emergency' ? (
          <EmergencyScreen
            apiUrl={effectiveApiUrl}
            status={status}
            onRescan={() => {
              setApiUrl('');
              setScanning(true);
            }}
          />
        ) : (
          <DriverMobileScreen
            apiUrl={effectiveApiUrl}
            onRescan={() => {
              setApiUrl('');
              setScanning(true);
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* =================================================================
   EMERGENCY PATIENT SCREEN (Native Mobile)
   ================================================================= */
function EmergencyScreen({ apiUrl, status, onRescan }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('Accident');
  const [priority, setPriority] = useState('Critical');
  const [location, setLocation] = useState(null);
  const [message, setMessage] = useState(status);
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
          <Pressable onPress={onRescan}>
            <Text style={styles.link}>Config</Text>
          </Pressable>
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
  const [driverName, setDriverName] = useState('');
  const [dispatches, setDispatches] = useState([]);
  const [activeDispatch, setActiveDispatch] = useState(null);
  const [patientDetails, setPatientDetails] = useState(null);
  const [hospitalDetails, setHospitalDetails] = useState(null);
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
      setDriverName(plateVal);
      setDriverStatusMsg('Connected online.');
      loadMissions(data.ambulanceId, data.token);
    } catch {
      Alert.alert('Network Error', `Could not reach ${apiUrl}. Keep backend running.`);
      setDriverStatusMsg('Connection failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleDemoLogin() {
    setDriverPhone('9999999999');
    setVehicleNumber('GJ-01-DEM');
    handleDriverLogin('9999999999', 'GJ-01-DEM');
  }

  async function loadMissions(ambId = ambulanceId, authToken = token) {
    if (!ambId || !authToken) return;
    try {
      const res = await fetch(`${apiUrl}/api/dispatch/ambulance/${ambId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const list = await res.json();
        setDispatches(list);
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

  function handleLogout() {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (pollTimer.current) clearInterval(pollTimer.current);
    setToken('');
    setAmbulanceId('');
    setActiveDispatch(null);
    setDispatches([]);
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

              <Pressable style={styles.quickDemoButton} onPress={handleDemoLogin}>
                <Text style={styles.quickDemoText}>⚡ One-Tap Demo Driver (GJ-01-DEM)</Text>
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

  quickDemoButton: { padding: 12, marginTop: 8 },
  quickDemoText: { color: '#38bdf8', textAlign: 'center', fontWeight: '800', fontSize: 13 },

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