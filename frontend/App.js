import Constants from 'expo-constants';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { WebView } from 'react-native-webview';
import DesktopApp from './src/App';

function getDesktopUiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  const expoHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  const host = expoHost?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}

function MobileDesktopApp() {
  const webView = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <WebView
          ref={webView}
          source={{ uri: getDesktopUiUrl() }}
          style={styles.webView}
          originWhitelist={['http://*', 'https://*']}
          javaScriptEnabled
          domStorageEnabled
          geolocationEnabled
          sharedCookiesEnabled
          onLoadStart={() => {
            setLoading(true);
            setLoadError(false);
          }}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setLoadError(true);
          }}
          onHttpError={({ nativeEvent }) => {
            if (nativeEvent.statusCode >= 500) {
              setLoading(false);
              setLoadError(true);
            }
          }}
          onShouldStartLoadWithRequest={({ url }) => {
            if (url.startsWith('tel:') || url.startsWith('mailto:')) {
              Linking.openURL(url).catch(() => {
                Alert.alert('Unable to open link', 'This link cannot be opened on this device.');
              });
              return false;
            }
            return true;
          }}
          renderLoading={() => null}
          startInLoadingState
        />
        {loading && !loadError ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading Smart Dispatch…</Text>
          </View>
        ) : null}
        {loadError ? (
          <View style={styles.error}>
            <Text style={styles.errorTitle}>Smart Dispatch is unavailable</Text>
            <Text style={styles.errorText}>
              Start the frontend with npm start and keep your phone and computer on the same Wi-Fi network.
            </Text>
            <Pressable
              style={styles.retry}
              onPress={() => {
                setLoadError(false);
                setLoading(true);
                webView.current?.reload();
              }}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function App() {
  if (Platform.OS === 'web') return <DesktopApp />;
  return <MobileDesktopApp />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f7fb' },
  webView: { flex: 1, backgroundColor: '#f4f7fb' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f7fb'
  },
  loadingText: { color: '#334155', marginTop: 12, fontSize: 14, fontWeight: '600' },
  error: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#f4f7fb'
  },
  errorTitle: { color: '#0f172a', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  errorText: { color: '#475569', fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  retry: { backgroundColor: '#2563eb', borderRadius: 10, marginTop: 20, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '700' }
});
