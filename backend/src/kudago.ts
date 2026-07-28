import type { Event } from "./types.js";
import { logger } from "./logger.js";

/**
 * Источник реальных событий — KudaGo (бесплатный публичный API, без ключа).
 * Берём ТОЛЬКО концерты и фестивали (categories=concert,festival).
 * Результат кэшируется в памяти на 30 минут.
 */
/** Префикс идентификаторов внешнего каталога — по нему они отличаются от наших. */
export const EXTERNAL_ID_PREFIX = "kudago_";

const CACHE_TTL = 30 * 60 * 1000;
/** Неудача держится минуту: достаточно, чтобы не долбить чужой сервис, и мало, чтобы не отключить каталог. */
const FAILURE_CACHE_TTL = 60 * 1000;
/** Внешний сервис, который не ответил за это время, считается недоступным. */
const REQUEST_TIMEOUT_MS = 3000;

let cache: { at: number; ttl: number; events: Event[] } | null = null;
/** Запрос «в полёте»: параллельные вызовы ждут его, а не запускают свои. */
let inFlight: Promise<Event[]> | undefined;

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
    id: `${EXTERNAL_ID_PREFIX}${k.id}`,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: (k.description ?? "").replace(/<[^>]+>/g, "").trim(),
    startsAt: d.toISOString(),
    timezone: "Europe/Moscow",
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
  // Без таймаута повисший ответ держит наш HTTP-запрос до таймаута клиента:
  // у fetch в Node своего таймаута нет.
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`KudaGo HTTP ${res.status} (${location})`);
  const data = (await res.json()) as { results?: KudaGoEvent[] };
  return data.results ?? [];
}

/**
 * Концерты и фестивали из KudaGo (Москва + Питер, с кэшем).
 *
 * Три свойства, без которых внешний каталог превращался в способ уронить сервис:
 *
 *  1. Запрос ограничен по времени (см. `fetchCity`).
 *  2. Параллельные вызовы разделяют один запрос. Без этого каждый входящий
 *     запрос запускал свою пару обращений наружу.
 *  3. Отказ тоже кэшируется, но на короткий срок. Раньше `cache` выставлялся
 *     только в успешной ветке, поэтому при недоступном KudaGo каждый вызов
 *     снова шёл в сеть. А вызывает это в том числе `GET /api/Events/:id` для
 *     любого неизвестного идентификатора — то есть обычный перебор id
 *     превращался в усиление трафика наружу.
 */
export async function getExternalEvents(): Promise<Event[]> {
  if (cache && Date.now() - cache.at < cache.ttl) return cache.events;
  inFlight ??= loadExternalEvents().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

async function loadExternalEvents(): Promise<Event[]> {
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
    cache = { at: Date.now(), ttl: CACHE_TTL, events };
    logger.info(`[kudago] загружено событий: ${events.length}`);
    return events;
  } catch (err) {
    logger.warn("[kudago] не удалось получить события:", err);
    // Короткий TTL: держать неудачу так же долго, как удачу, значило бы
    // отключить каталог на весь срок кэша из-за одной сетевой икоты.
    const events = cache?.events ?? [];
    cache = { at: Date.now(), ttl: FAILURE_CACHE_TTL, events };
    return events;
  }
}

export function findExternalEvent(id: string): Event | undefined {
  return cache?.events.find((e) => e.id === id);
}
