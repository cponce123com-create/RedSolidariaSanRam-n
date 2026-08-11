import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { MapPin, Trash2 } from "lucide-react";

/**
 * Selector visual de ubicación para el panel admin (mapa libre OpenStreetMap).
 * El administrador hace clic en el mapa para marcar las coordenadas de la
 * campaña; se muestra un pin en la posición seleccionada.
 *
 * Lazy-loaded desde el formulario de campaña para no inflar el bundle admin.
 */

// Pin de marca (divIcon): mismo estilo que CampaignMap (verde selva).
const pinIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width: 26px; height: 26px; border-radius: 50% 50% 50% 0;
      background: #2f8332; transform: rotate(-45deg);
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
    ">
      <div style="
        width: 10px; height: 10px; border-radius: 50%;
        background: #fff; transform: rotate(45deg);
      "></div>
    </div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

// Centro por defecto: San Ramón, Chanchamayo (Perú)
const SAN_RAMON: [number, number] = [-11.1229, -75.3548];

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface CampaignLocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number | null, longitude: number | null) => void;
}

export default function CampaignLocationPicker({
  latitude,
  longitude,
  onChange,
}: CampaignLocationPickerProps) {
  const [position, setPosition] = useState<[number, number] | null>(
    latitude != null && longitude != null ? [latitude, longitude] : null,
  );

  const handlePick = (lat: number, lng: number) => {
    setPosition([lat, lng]);
    onChange(lat, lng);
  };

  const handleClear = () => {
    setPosition(null);
    onChange(null, null);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl overflow-hidden border border-border h-64 relative z-0">
        <MapContainer
          center={position ?? SAN_RAMON}
          zoom={12}
          scrollWheelZoom={false}
          className="w-full h-full"
          aria-label="Mapa para seleccionar la ubicación de la campaña"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={handlePick} />
          {position && <Marker position={position} icon={pinIcon} />}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          Haz clic en el mapa para marcar la ubicación de la campaña.
        </p>
        {position && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="h-8 rounded-lg text-muted-foreground"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Quitar ubicación
          </Button>
        )}
      </div>
    </div>
  );
}
