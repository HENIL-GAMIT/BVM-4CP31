import React from 'react';

export default function MapView({ markers = [], route = null, zoom = 14, height = 360 }) {
  if (!markers || markers.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
        📍 Acquiring GPS coordinates...
      </div>
    );
  }

  // Determine origin and destination for driving route if available
  let origin = route?.origin;
  let destination = route?.destination;

  if (!origin || !destination) {
    const ambMarker = markers.find(
      (m) => (m.label || '').toLowerCase().includes('ambulance') || (m.type || '').toLowerCase().includes('ambulance')
    );
    const ptMarker = markers.find(
      (m) =>
        (m.label || '').toLowerCase().includes('location') ||
        (m.label || '').toLowerCase().includes('patient') ||
        (m.label || '').toLowerCase().includes('pickup')
    );
    const hospMarker = markers.find(
      (m) => (m.label || '').toLowerCase().includes('hospital') || (m.label || '').toLowerCase().includes('trauma')
    );

    if (ambMarker && (ptMarker || hospMarker)) {
      origin = {
        lat: ambMarker.latitude ?? ambMarker.lat,
        lng: ambMarker.longitude ?? ambMarker.lng,
        label: ambMarker.label || 'Ambulance'
      };
      const destTarget = ptMarker || hospMarker;
      destination = {
        lat: destTarget.latitude ?? destTarget.lat,
        lng: destTarget.longitude ?? destTarget.lng,
        label: destTarget.label || 'Destination'
      };
    }
  }

  const hasValidRoute =
    origin &&
    destination &&
    origin.lat != null &&
    origin.lng != null &&
    destination.lat != null &&
    destination.lng != null &&
    !isNaN(origin.lat) &&
    !isNaN(origin.lng) &&
    !isNaN(destination.lat) &&
    !isNaN(destination.lng);

  const center = markers[0];
  const centerLat = center.latitude ?? center.lat ?? 22.3072;
  const centerLng = center.longitude ?? center.lng ?? 73.1812;

  let mapSrc = `https://maps.google.com/maps?q=${centerLat},${centerLng}&z=${zoom}&output=embed`;
  let directionsUrl = null;

  if (hasValidRoute) {
    mapSrc = `https://maps.google.com/maps?saddr=${origin.lat},${origin.lng}&daddr=${destination.lat},${destination.lng}&output=embed`;
    directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
  }

  return (
    <div className="map-view-container" style={{ width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff' }}>
      {/* Route & Directions Navigation Bar */}
      {hasValidRoute && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            background: '#0f172a',
            color: '#f8fafc',
            padding: '9px 14px',
            fontSize: '0.85rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>● LIVE ROUTE</span>
            <span style={{ color: '#94a3b8' }}>|</span>
            <span style={{ fontWeight: 500 }}>
              {origin.label} ➔ {destination.label}
            </span>
          </div>

          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#2563eb',
                color: '#ffffff',
                padding: '5px 12px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}
            >
              🗺️ Open in Google Maps
            </a>
          )}
        </div>
      )}

      {/* Map Embed Frame */}
      <iframe
        title="Live Emergency Map"
        src={mapSrc}
        width="100%"
        height={height}
        style={{ border: 0, display: 'block', width: '100%' }}
        loading="lazy"
        allowFullScreen
      />

      {/* Markers Info Bar */}
      <div style={{ padding: '8px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {markers.map((m, i) => {
            const mLat = m.latitude ?? m.lat;
            const mLng = m.longitude ?? m.lng;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <strong style={{ color: '#334155' }}>{m.label || `Point ${i + 1}`}</strong>
                {mLat != null && mLng != null && (
                  <span style={{ color: '#64748b' }}>
                    ({Number(mLat).toFixed(4)}, {Number(mLng).toFixed(4)})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
