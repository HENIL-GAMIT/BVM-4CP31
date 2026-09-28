import React from 'react';

export default function MapView({ markers = [], zoom = 14, height = 360 }) {
  if (!markers || markers.length === 0) return <div style={{ padding: 12 }}>No locations to show</div>;

  const center = markers[0];
  const centerLat = center.latitude || center.lat || 0;
  const centerLng = center.longitude || center.lng || 0;
  const src = `https://www.google.com/maps?q=${centerLat},${centerLng}&z=${zoom}&output=embed`;

  return (
    <div className="map-view">
      <iframe title="map" src={src} width="100%" height={height} style={{ border: 0 }} loading="lazy"></iframe>
      <div style={{ padding: 8 }}>
        {markers.map((m, i) => (
          <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>{m.label || (m.type || 'Marker')}</strong>: {m.latitude ?? m.lat},{' '}{m.longitude ?? m.lng}
          </div>
        ))}
      </div>
    </div>
  );
}
