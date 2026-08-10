import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "wouter";
import { useTheme } from "@/hooks/use-theme";

/**
 * Mapa de campañas (fase 2 del rediseño — inspirado en shareish/Storm).
 *
 * Lazy-loaded desde las páginas que lo usan para mantener leaflet (~150 KB)
 * fuera del bundle principal.
 *
 * El tipo generado por api-client-react aún no incluye lat/lng (la spec
 * OpenAPI no se regeneró); aquí se declara el subtipo local con los campos
 * del mapa como opcionales (el tipo generado satisface la estructura).
 */
export interface MappableCampaign {
  id: number;
  title: string;
  imageUrl?: string | null;
  status: string;
  category?: string;
  raised: number;
  goal: number;
  latitude?: number | null;
  longitude?: number | null;
}

interface CampaignMapProps {
  campaigns: MappableCampaign[];
  className?: string;
}

// Pin de marca (divIcon): evita los PNG rotos de Leaflet con bundlers y
// mantiene la identidad visual (verde selva + punto blanco).
function campaignIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 26px; height: 26px; border-radius: 50% 50% 50% 0;
        background: ${color}; transform: rotate(-45deg);
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
    popupAnchor: [0, -26],
  });
}

const progressPct = (raised: number, goal: number) =>
  goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

export function CampaignMap({ campaigns, className }: CampaignMapProps) {
  const { theme } = useTheme();
  const located = campaigns.filter((c) => c.latitude != null && c.longitude != null);

  if (located.length === 0) return null;

  const bounds = L.latLngBounds(located.map((c) => [c.latitude!, c.longitude!] as [number, number]));
  const center = bounds.getCenter();
  const isDark = theme === "dark";

  return (
    <div className={`rounded-3xl overflow-hidden border border-border shadow-sm ${className ?? ""}`}>
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [40, 40] }}
        center={center}
        zoom={11}
        scrollWheelZoom={false}
        className="w-full h-[520px] z-0"
        aria-label="Mapa de campañas solidarias"
      >
        {/* Tiles según tema: OSM claro / CartoDB dark_matter */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={
            isDark
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />
        {located.map((c) => (
          <Marker
            key={c.id}
            position={[c.latitude!, c.longitude!]}
            icon={campaignIcon(c.status === "active" ? "#2f8332" : "#6b7280")}
          >
            <Popup>
              <div className="text-center min-w-[180px]">
                {c.imageUrl && (
                  <img
                    src={c.imageUrl}
                    alt=""
                    className="w-full h-24 object-cover rounded-lg mb-2"
                    loading="lazy"
                  />
                )}
                <p className="font-display font-bold text-sm mb-1 leading-tight">{c.title}</p>
                <p className="text-xs text-muted-foreground mb-2">
                  {progressPct(c.raised, c.goal)}% de S/ {c.goal.toLocaleString("es-PE")}
                </p>
                <Link
                  href={`/campanas/${c.id}`}
                  className="inline-block text-xs font-semibold text-primary hover:underline"
                >
                  Ver campaña →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default CampaignMap;
