import { makeAutoObservable, runInAction } from "mobx";
import { eventsAPI, type Event as ApiEvent } from "../services/api";

/**
 * Внутренняя модель события. Расширена полем `place` (алиас `location`),
 * которым исторически пользуются страницы фронта, и строковым `id`.
 */
export interface IEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  place?: string;
  location?: string;
  category?: string;
  image?: string | null;
  coords?: [number, number];
  participants?: number;
  author?: string;
}

/** API-модель -> внутренняя модель (раскладываем location в place для UI). */
function normalize(e: ApiEvent): IEvent {
  return {
    id: String(e.id),
    title: e.title,
    description: e.description,
    date: e.date,
    time: e.time,
    location: e.location,
    place: e.location ?? (e as { place?: string }).place,
    category: e.category,
    image: e.image ?? null,
    coords: e.coords,
    participants: e.participants,
    author: e.author,
  };
}

class EventStore {
  events: IEvent[] = [];
  acceptedEvents: IEvent[] = [];
  createdEvents: IEvent[] = [];
  isLoading = false;
  loaded = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  /** Загрузка ленты с бэкенда. Повторно не дёргает, пока loaded (если не force). */
  fetchEvents = async (force = false): Promise<void> => {
    if (this.isLoading) return;
    if (this.loaded && !force) return;
    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });
    try {
      const res = await eventsAPI.getAll();
      if (res.error || !res.data) throw new Error(res.error ?? "Пустой ответ сервера");
      const items = res.data.map(normalize);
      runInAction(() => {
        this.events = items;
        this.loaded = true;
        this.isLoading = false;
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : "Не удалось загрузить события";
        this.isLoading = false;
      });
    }
  };

  getById(id: string | number): IEvent | undefined {
    const key = String(id);
    return (
      this.events.find((e) => e.id === key) ??
      this.createdEvents.find((e) => e.id === key) ??
      this.acceptedEvents.find((e) => e.id === key)
    );
  }

  getFilteredEvents(query: string): IEvent[] {
    const q = query.toLowerCase();
    return this.events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.place || e.location || "").toLowerCase().includes(q),
    );
  }

  /** Создание повода: POST на бэкенд + локальное обновление ленты. */
  createEvent = async (payload: {
    title: string;
    description?: string;
    date: string;
    time?: string;
    location?: string;
    category?: string;
    image?: string | null;
    coords?: [number, number];
    format?: "public" | "private";
    author?: string;
    authorId?: string;
  }): Promise<IEvent | null> => {
    try {
      const body: Omit<ApiEvent, "id"> = {
        title: payload.title,
        description: payload.description ?? "",
        date: payload.date,
        time: payload.time ?? "",
        location: payload.location ?? "",
        category: payload.category,
        author: payload.author ?? "Гость",
        authorId: payload.authorId,
        participants: 1,
        image: payload.image ?? undefined,
        coords: payload.coords,
        format: payload.format,
      };
      const res = await eventsAPI.create(body);
      if (res.error || !res.data) throw new Error(res.error ?? "Ошибка создания события");
      const ev = normalize(res.data);
      runInAction(() => {
        this.events.unshift(ev);
        this.createdEvents.unshift(ev);
      });
      return ev;
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : "Не удалось создать событие";
      });
      return null;
    }
  };

  /** Записаться на событие: оптимистично обновляем UI, затем синхронизируем с API. */
  join = async (event: IEvent): Promise<void> => {
    runInAction(() => {
      if (!this.acceptedEvents.some((x) => x.id === event.id)) this.acceptedEvents.push(event);
      const target = this.events.find((x) => x.id === event.id);
      if (target) target.participants = (target.participants ?? 0) + 1;
    });
    try {
      await eventsAPI.join(event.id);
    } catch {
      /* офлайн: локальное состояние уже обновлено */
    }
  };

  /** Отписаться от события. */
  leave = async (event: IEvent): Promise<void> => {
    runInAction(() => {
      this.acceptedEvents = this.acceptedEvents.filter((x) => x.id !== event.id);
      const target = this.events.find((x) => x.id === event.id);
      if (target && target.participants) target.participants -= 1;
    });
    try {
      await eventsAPI.leave(event.id);
    } catch {
      /* ignore */
    }
  };

  // --- обратная совместимость со старым API стора ---
  addAcceptedEvent(event: IEvent) {
    if (!this.acceptedEvents.some((item) => item.id === event.id)) this.acceptedEvents.push(event);
  }
  addCreatedEvent(event: IEvent) {
    this.createdEvents.push(event);
  }
  removeAcceptedEvent(event: IEvent) {
    this.acceptedEvents = this.acceptedEvents.filter((item) => item.id !== event.id);
  }
}

export const eventStore = new EventStore();
