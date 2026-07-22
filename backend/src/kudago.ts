import type { Event } from "./types";

/**
 * Источник реальных событий — KudaGo (бесплатный публичный API, без ключа).
 * Берём ТОЛЬКО концерты и фестивали (categories=concert,festival).
 * Результат кэшируется в памяти на 30 минут.
 */
const CACHE_TTL = 30 * 60 * 1000;
let cache: { at: number; events: Event[] } | null = null;

const pad = (n: number) => String(n).padStart(2, "0");

interface KudaGoPlace {
  title?: string;
  address?: string;
  coords?: { lat: number; lon: number };
}
interface KudaGoEvent {
  id: number;
  title?: string;
  description?: string;
  dates?: { start: number; end: number }[];
  place?: KudaGoPlace | null;
  images?: { image: string }[];
  categories?: string[];
}

function toEvent(k: KudaGoEvent): Event | null {
  // выбираем ближайшую БУДУЩУЮ дату; если её нет — пропускаем событие
  const now = Math.floor(Date.now() / 1000);
  const start = (k.dates ?? [])
    .map((d) => d.start)
    .filter((s) => s && s >= now)
    .sort((a, b) => a - b)[0];
  if (!start) return null;
  const d = new Date(start * 1000);
  if (Number.isNaN(d.getTime())) return null;

  const isFest = (k.categories ?? []).includes("festival");
  const title = (k.title ?? "Событие").trim();
  const coords = k.place?.coords
    ? ([k.place.coords.lat, k.place.coords.lon] as [number, number])
    : undefined;

  return {
    id: `kudago_${k.id}`,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: (k.description ?? "").replace(/<[^>]+>/g, "").trim(),
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    location: k.place?.title || k.place?.address || "Москва",
    // category "Музыка" — чтобы попадало под фильтр интересов на фронте
    category: "Музыка",
    author: "KudaGo",
    authorId: "kudago",
    participants: 0,
    participantIds: [],
    image: k.images?.[0]?.image,
    tags: [isFest ? "Фестиваль" : "Концерт", "Музыка"],
    coords,
    format: "public",
    createdAt: new Date().toISOString(),
  };
}

async function fetchCity(location: string): Promise<KudaGoEvent[]> {
  const now = Math.floor(Date.now() / 1000);
  const url =
    "https://kudago.com/public-api/v1.4/events/" +
    "?lang=ru&fields=id,title,description,dates,place,images,categories" +
    `&expand=place&categories=concert,festival&location=${location}` +
    `&actual_since=${now}&page_size=50&text_format=text&order_by=dates`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`KudaGo HTTP ${res.status} (${location})`);
  const data = (await res.json()) as { results?: KudaGoEvent[] };
  return data.results ?? [];
}

/** Концерты и фестивали из KudaGo (Москва + Питер, с кэшем). При ошибке — прошлый кэш или []. */
export async function getExternalEvents(): Promise<Event[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.events;
  try {
    const raw = (await Promise.all([fetchCity("msk"), fetchCity("spb")])).flat();
    const seen = new Set<string>();
    const events = raw
      .map(toEvent)
      .filter((e): e is Event => e !== null)
      .filter((e) => {
        const key = e.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    cache = { at: Date.now(), events };
    console.log(`[kudago] загружено событий: ${events.length}`);
    return events;
  } catch (err) {
    console.warn("[kudago] не удалось получить события:", err);
    return cache?.events ?? [];
  }
}

export function findExternalEvent(id: string): Event | undefined {
  return cache?.events.find((e) => e.id === id);
}
