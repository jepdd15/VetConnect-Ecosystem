import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import { COLORS, FONT, TYPE } from '../theme/designTokens';

// Fix Leaflet default-icon paths broken by Vite bundling.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapController({ centerLat, centerLng }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([centerLat, centerLng], map.getZoom(), { duration: 0.8 });
  }, [centerLat, centerLng, map]);
  return null;
}

export default function LocationPicker({ latitude, longitude, radius, onChange }) {
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const lat = latitude || 16.0389;
  const lng = longitude || 120.3977;
  const r = radius || 500;
  const center = useMemo(() => [lat, lng], [lat, lng]);

  const commitCoords = (newLat, newLng) => {
    onChange({
      latitude: parseFloat(newLat.toFixed(6)),
      longitude: parseFloat(newLng.toFixed(6)),
    });
  };

  const handleMapClick = (clickLat, clickLng) => commitCoords(clickLat, clickLng);
  const handleMarkerDrag = (e) => {
    const { lat: dragLat, lng: dragLng } = e.target.getLatLng();
    commitCoords(dragLat, dragLng);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('This browser does not support location lookup.');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        commitCoords(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(
          err.code === 1
            ? 'Location permission denied. Please allow location access in your browser and try again.'
            : 'Could not determine your location. Try again or click the map to set it manually.'
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <Box>
      <Box
        sx={{
          height: 340,
          border: `2px solid ${COLORS.brand}`,
          boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)',
          mb: 2,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <MapContainer
          center={center}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={center}
            draggable
            eventHandlers={{ dragend: handleMarkerDrag }}
          />
          <Circle
            center={center}
            radius={r}
            pathOptions={{
              color: COLORS.brand,
              fillColor: COLORS.accent,
              fillOpacity: 0.15,
              weight: 2,
            }}
          />
          <MapClickHandler onMapClick={handleMapClick} />
          <MapController centerLat={lat} centerLng={lng} />
        </MapContainer>
      </Box>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={geoLoading ? <CircularProgress size={16} sx={{ color: COLORS.brand }} /> : <MyLocationIcon />}
          onClick={handleUseCurrentLocation}
          disabled={geoLoading}
          sx={{
            fontWeight: 900,
            borderRadius: 0,
            borderColor: COLORS.brand,
            borderWidth: 2,
            color: COLORS.brand,
            '&:hover': { bgcolor: COLORS.cream, borderColor: COLORS.brand, borderWidth: 2 },
            '&.Mui-disabled': { borderColor: COLORS.borderLight, color: COLORS.textMuted },
          }}
        >
          {geoLoading ? 'Locating…' : 'Use My Current Location'}
        </Button>
        {geoError && (
          <Typography sx={{ ...TYPE.meta, color: COLORS.danger, fontSize: '0.78rem', flex: 1, minWidth: 200 }}>
            {geoError}
          </Typography>
        )}
      </Stack>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 160, p: 1.5, bgcolor: 'white', border: `2px solid ${COLORS.accent}33` }}>
          <Typography sx={{ ...TYPE.label, color: COLORS.accent, fontSize: '0.7rem', mb: 0.5 }}>
            Latitude
          </Typography>
          <Typography sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.brand, fontSize: '1rem' }}>
            {lat.toFixed(6)}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 160, p: 1.5, bgcolor: 'white', border: `2px solid ${COLORS.accent}33` }}>
          <Typography sx={{ ...TYPE.label, color: COLORS.accent, fontSize: '0.7rem', mb: 0.5 }}>
            Longitude
          </Typography>
          <Typography sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.brand, fontSize: '1rem' }}>
            {lng.toFixed(6)}
          </Typography>
        </Box>
      </Box>

      <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.74rem' }}>
        Click anywhere on the map, drag the pin, or tap "Use My Current Location" to set the clinic's position. The shaded circle shows the check-in zone.
      </Typography>
    </Box>
  );
}
