import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

/**
 * Карта места события.
 *
 * Leaflet приходит из сборки, а не с `unpkg.com`. Прежняя версия подгружала и
 * скрипт, и стили с этого CDN во время работы страницы — а он стоит за
 * Cloudflare, трафик к которому российские провайдеры с июня 2025 ограничивают
 * первыми 16 КБ. То есть у части наших же пользователей карта не рисовалась
 * вовсе, и понять почему было невозможно: ошибки в приложении нет, просто
 * пустой прямоугольник.
 *
 * Загрузка отложенная (`import()` внутри эффекта): библиотека весит заметно, а
 * нужна только на странице события. Сборщик выносит её отдельным куском,
 * который не тянется на остальных экранах.
 */

interface EventMapProps {
  coords: [number, number];
}

export const EventMap = ({ coords }: EventMapProps) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);

  useEffect(() => {
    // Отменяет установку, если компонент успели размонтировать, пока грузился
    // модуль: иначе Leaflet цепляется к узлу, которого уже нет.
    let cancelled = false;

    const setup = async () => {
      const [leaflet] = await Promise.all([
        import("leaflet"),
        // Стили тоже из сборки — это тот же CDN, что и скрипт.
        import("leaflet/dist/leaflet.css"),
      ]);
      if (cancelled || !container.current) return;

      const L = leaflet.default;
      map.current?.remove();

      const instance = L.map(container.current, {
        attributionControl: false,
        zoomControl: false,
      }).setView(coords, 14);
      map.current = instance;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(instance);

      const pin = L.divIcon({
        className: "povod-map-pin",
        html: `<div style="background-color:var(--povod-primary); width:12px; height:12px; border-radius:50%; border:3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      L.marker(coords, { icon: pin }).addTo(instance);

      /*
       * Пересчёт размеров после первой отрисовки. Карта нередко создаётся,
       * пока контейнер ещё не получил высоту, и тогда плитки встают неверно.
       */
      requestAnimationFrame(() => instance.invalidateSize());
    };

    void setup();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [coords]);

  return (
    <div
      ref={container}
      style={{
        width: "100%",
        height: "clamp(180px, 32vw, 360px)",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid var(--povod-border)",
      }}
    />
  );
};
