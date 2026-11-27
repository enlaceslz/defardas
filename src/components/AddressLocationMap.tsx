import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, Navigation } from 'lucide-react';
import { formatCoordinates, isValidCoordinates } from '../utils/addressUtils';

interface AddressLocationMapProps {
  latitude?: number;
  longitude?: number;
  label?: string;
  editable?: boolean;
  onCoordinatesChange?: (lat: number, lng: number) => void;
  originLat?: number;
  originLng?: number;
  originLabel?: string;
  routeGeometry?: Array<[number, number]>;
  heightClass?: string;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [-2.53073, -44.3068]; // São Luís / MA

const DESTINATION_PIN_ICON = L.divIcon({
  className: 'defardas-map-pin-dest',
  html: `<svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
    <path d="M17 1C8.163 1 1 8.163 1 17C1 28.5 17 43 17 43C17 43 33 28.5 33 17C33 8.163 25.837 1 17 1Z" fill="#C8102E" stroke="#FFFFFF" stroke-width="2"/>
    <circle cx="17" cy="17" r="6" fill="#FFFFFF"/>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 42],
  popupAnchor: [0, -38],
});

const ORIGIN_PIN_ICON = L.divIcon({
  className: 'defardas-map-pin-origin',
  html: `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.3));">
    <circle cx="13" cy="13" r="10" fill="#10B981" stroke="#FFFFFF" stroke-width="3"/>
    <circle cx="13" cy="13" r="3.5" fill="#FFFFFF"/>
  </svg>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -14],
});

function createSafePopupElement(title: string, subtitle?: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'text-xs leading-snug';
  const strong = document.createElement('div');
  strong.className = 'font-bold text-zinc-900';
  strong.textContent = title;
  wrap.appendChild(strong);
  if (subtitle) {
    const sub = document.createElement('div');
    sub.className = 'font-mono text-[11px] text-zinc-600 mt-0.5';
    sub.textContent = subtitle;
    wrap.appendChild(sub);
  }
  return wrap;
}

export const AddressLocationMap: React.FC<AddressLocationMapProps> = ({
  latitude,
  longitude,
  label = 'Endereço de Destino',
  editable = false,
  onCoordinatesChange,
  originLat,
  originLng,
  originLabel = 'Seu Ponto de Partida',
  routeGeometry,
  heightClass = 'h-56',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const onChangeRef = useRef(onCoordinatesChange);
  onChangeRef.current = onCoordinatesChange;

  const hasDest = isValidCoordinates(latitude, longitude);
  const hasOrigin = isValidCoordinates(originLat, originLng);

  // Inicializar instância Leaflet uma vez
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const initialCenter: [number, number] = hasDest
      ? [latitude!, longitude!]
      : DEFAULT_CENTER;

    const map = L.map(el, {
      center: initialCenter,
      zoom: hasDest ? 16 : 12,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(el);

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      destMarkerRef.current = null;
      originMarkerRef.current = null;
      polylineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click no mapa para reposicionar pino quando em modo editável
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (!editable || !onChangeRef.current) return;
      const lat = Math.round(e.latlng.lat * 1_000_000) / 1_000_000;
      const lng = Math.round(e.latlng.lng * 1_000_000) / 1_000_000;
      onChangeRef.current(lat, lng);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [editable]);

  // Atualizar marcadores e rota quando props mudarem
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Destino
    if (hasDest) {
      const destPos: [number, number] = [latitude!, longitude!];
      const popupEl = createSafePopupElement(label, formatCoordinates(latitude!, longitude!));

      if (!destMarkerRef.current) {
        const marker = L.marker(destPos, {
          icon: DESTINATION_PIN_ICON,
          draggable: editable,
        }).addTo(map);
        marker.bindPopup(popupEl);
        marker.on('dragend', () => {
          if (!onChangeRef.current) return;
          const pos = marker.getLatLng();
          onChangeRef.current(
            Math.round(pos.lat * 1_000_000) / 1_000_000,
            Math.round(pos.lng * 1_000_000) / 1_000_000
          );
        });
        destMarkerRef.current = marker;
      } else {
        destMarkerRef.current.setLatLng(destPos);
        destMarkerRef.current.setPopupContent(popupEl);
        if (destMarkerRef.current.dragging) {
          if (editable) destMarkerRef.current.dragging.enable();
          else destMarkerRef.current.dragging.disable();
        }
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    // 2. Origem (quando em modo rota)
    if (hasOrigin) {
      const origPos: [number, number] = [originLat!, originLng!];
      const origPopupEl = createSafePopupElement(
        originLabel,
        formatCoordinates(originLat!, originLng!)
      );
      if (!originMarkerRef.current) {
        originMarkerRef.current = L.marker(origPos, { icon: ORIGIN_PIN_ICON })
          .addTo(map)
          .bindPopup(origPopupEl);
      } else {
        originMarkerRef.current.setLatLng(origPos);
        originMarkerRef.current.setPopupContent(origPopupEl);
      }
    } else if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }

    // 3. Polilinha de rota
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    const validRoutePoints = Array.isArray(routeGeometry)
      ? routeGeometry.filter(([lat, lng]) => isValidCoordinates(lat, lng))
      : [];

    if (validRoutePoints.length >= 2) {
      const polyline = L.polyline(validRoutePoints, {
        color: '#C8102E',
        weight: 5,
        opacity: 0.9,
        lineJoin: 'round',
      }).addTo(map);
      polylineRef.current = polyline;

      const bounds = polyline.getBounds();
      if (hasOrigin) bounds.extend([originLat!, originLng!]);
      if (hasDest) bounds.extend([latitude!, longitude!]);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    } else if (hasOrigin && hasDest) {
      const bounds = L.latLngBounds([
        [originLat!, originLng!],
        [latitude!, longitude!],
      ]);
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 16 });
    } else if (hasDest) {
      map.setView([latitude!, longitude!], Math.max(map.getZoom(), 16), { animate: true });
    }

    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [
    hasDest,
    latitude,
    longitude,
    label,
    editable,
    hasOrigin,
    originLat,
    originLng,
    originLabel,
    routeGeometry,
  ]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (polylineRef.current) {
      map.fitBounds(polylineRef.current.getBounds(), { padding: [36, 36], maxZoom: 16 });
    } else if (hasDest) {
      map.setView([latitude!, longitude!], 16, { animate: true });
    } else {
      map.setView(DEFAULT_CENTER, 12, { animate: true });
    }
  };

  return (
    <div className={`relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 ${className}`}>
      <div ref={containerRef} className={`w-full ${heightClass} z-0`} />

      {!hasDest && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[400] bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-600 shadow-xs flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-[#C8102E] shrink-0" />
          <span>
            Informe o <strong>CEP e Número</strong> ou clique diretamente no mapa para posicionar o pino exato.
          </span>
        </div>
      )}

      {hasDest && (
        <div className="absolute top-2.5 right-2.5 z-[400] flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRecenter}
            title="Centralizar mapa no marcador"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white/95 hover:bg-white text-slate-800 border border-slate-300 rounded-lg text-[11px] font-semibold shadow-sm cursor-pointer"
          >
            {routeGeometry && routeGeometry.length >= 2 ? (
              <Navigation className="w-3 h-3 text-[#C8102E]" />
            ) : (
              <Crosshair className="w-3 h-3 text-[#C8102E]" />
            )}
            <span>Centralizar</span>
          </button>
        </div>
      )}

      {hasDest && editable && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-[400] bg-[#111113]/85 text-white px-2.5 py-1 rounded-md text-[10px] font-mono tabular-nums shadow-xs">
          Arraste o pino ou clique no mapa · {formatCoordinates(latitude!, longitude!)}
        </div>
      )}
    </div>
  );
};
