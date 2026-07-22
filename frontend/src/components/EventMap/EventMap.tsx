import React, { useEffect, useRef } from "react";

interface EventMapProps {
  coords: [number, number];
}

export const EventMap: React.FC<EventMapProps> = ({ coords }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletInstance = useRef<any>(null);

  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    if (!document.getElementById("leaflet-vkui-fix")) {
      const style = document.createElement("style");
      style.id = "leaflet-vkui-fix";
      style.innerHTML = `
            .leaflet-tile-container img {
            max-width: none !important;
            max-height: none !important;
            }
            .leaflet-container { outline: none; z-index: 1; }
        `;
      document.head.appendChild(style);
    }

    const init = () => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      if (leafletInstance.current) {
        leafletInstance.current.remove();
      }

      const map = L.map(mapRef.current, {
        attributionControl: false,
        zoomControl: false,
      }).setView(coords, 14);

      leafletInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      const customIcon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="background-color:var(--vkui--color_background_accent); width:12px; height:12px; border-radius:50%; border:3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      L.marker(coords, { icon: customIcon }).addTo(map);

      setTimeout(() => {
        map.invalidateSize();
      }, 1000);
    };

    if (!(window as any).L) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = init;
      document.body.appendChild(script);
    } else {
      init();
    }

    return () => {
      if (leafletInstance.current) {
        leafletInstance.current.remove();
        leafletInstance.current = null;
      }
    };
  }, [coords]);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "200px",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid var(--vkui--color_separator_primary_alpha)",
      }}
    />
  );
};
