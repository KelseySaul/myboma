import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

export type MapCoordinates = { latitude: number; longitude: number };

type MapPickerProps = {
  value: MapCoordinates | null;
  onChange: (coordinates: MapCoordinates) => void;
  onClear?: () => void;
};

const DEFAULT_CENTER: LatLngExpression = [-1.286389, 36.817223];

function PinDropper({ onChange }: { onChange: MapPickerProps['onChange'] }) {
  useMapEvents({
    click(event) {
      onChange({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });
  return null;
}

function Recenter({ value }: { value: MapCoordinates | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.latitude, value.longitude], Math.max(map.getZoom(), 16));
  }, [map, value?.latitude, value?.longitude]);
  return null;
}

/** Lets a landlord save an exact building location without requiring a map API key. */
export default function MapPicker({ value, onChange, onClear }: MapPickerProps) {
  const center: LatLngExpression = value ? [value.latitude, value.longitude] : DEFAULT_CENTER;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Pin on map</label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {value ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}` : 'Optional — tap the exact building location'}
          </span>
          {value && onClear && (
            <button type="button" onClick={onClear} className="text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white">
              Remove pin
            </button>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <MapContainer
          center={center}
          zoom={value ? 16 : 12}
          scrollWheelZoom={false}
          className="h-56 w-full"
          aria-label="Map for choosing a building location"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <PinDropper onChange={onChange} />
          <Recenter value={value} />
          {value && <CircleMarker center={[value.latitude, value.longitude]} radius={9} pathOptions={{ color: '#18181b', fillColor: '#ffffff', fillOpacity: 1, weight: 3 }} />}
        </MapContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-500">Click or tap the map to move the pin. The address above is still used for display and search.</p>
    </div>
  );
}
