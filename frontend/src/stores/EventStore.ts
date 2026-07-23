import { makeAutoObservable, runInAction } from "mobx";
import {
  eventsAPI,
  type Event as ApiEvent,
  type EventWrite,
} from "../services/api";

/**
 * Внутренняя модель события. Расширена полем `place` (алиас `location`),
 * которым исторически пользуются страницы фронта, и строковым `id`.
 */
export interface IEvent {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  timezone: string;
  place?: string;
  location?: string;
  category?: string;
  image?: string | null;
  coords?: [number, number];
  participants?: number;
  participantIds?: string[];
  author?: string;
  authorId?: string;
  tags?: string[];
  format?: "public" | "private";
  createdAt?: string;
}

/** API-модель -> внутренняя модель (раскладываем location в place для UI). */
function normalize(e: ApiEvent): IEvent {
  return {
    id: String(e.id),
    title: e.title,
    description: e.description,
    startsAt: e.startsAt,
    timezone: e.timezone,
    location: e.location,
    place: e.location ?? (e as { place?: string }).place,
    category: e.category,
    image: e.image ?? null,
    coords: e.coords,
    participants: e.participants,
    participantIds: e.participantIds,
    author: e.author,
    authorId: e.authorId,
    tags: e.tags,
    format: e.format,
    createdAt: e.createdAt,
  };
}

class EventStore {
  events: IEvent[] = [];
  acceptedEvents: IEvent[] = [];
  createdEvents: IEvent[] = [];
  eventDetailLoading = new Set<string>();
  eventDetailLoaded = new Set<string>();
  eventDetailNotFound = new Set<string>();
  eventDetailErrors = new Map<string, string>();
  isLoading = false;
  loaded = false;
  error: string | null = null;
  isMyEventsLoading = false;
  myEventsLoaded = false;
  myEventsError: string | null = null;
  actionError: string | null = null;

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

  fetchMyEvents = async (force = false): Promise<void> => {
    if (this.isMyEventsLoading || (this.myEventsLoaded && !force)) return;
    runInAction(() => {
      this.isMyEventsLoading = true;
      this.myEventsError = null;
    });
    try {
      const response = await eventsAPI.getMine();
      if (response.error || !response.data) {
        throw new Error(response.error ?? "Не удалось загрузить мои события");
      }
      runInAction(() => {
        this.createdEvents = response.data!.created.map(normalize);
        this.acceptedEvents = response.data!.attending.map(normalize);
        this.myEventsLoaded = true;
        this.isMyEventsLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.myEventsError =
          error instanceof Error ? error.message : "Не удалось загрузить мои события";
        this.isMyEventsLoading = false;
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

  isEventDetailLoading(id: string): boolean {
    return this.eventDetailLoading.has(id);
  }

  isEventDetailLoaded(id: string): boolean {
    return this.eventDetailLoaded.has(id);
  }

  getEventDetailError(id: string): string | null {
    return this.eventDetailErrors.get(id) ?? null;
  }

  isEventDetailNotFound(id: string): boolean {
    return this.eventDetailNotFound.has(id);
  }

  /** Загружает событие независимо от общей ленты, чтобы прямые ссылки работали надёжно. */
  fetchEventById = async (id: string, force = false): Promise<void> => {
    if (this.eventDetailLoading.has(id)) return;
    if (this.eventDetailLoaded.has(id) && !force) return;

    runInAction(() => {
      this.eventDetailLoading.add(id);
      this.eventDetailErrors.delete(id);
      this.eventDetailNotFound.delete(id);
    });

    try {
      const response = await eventsAPI.getById(id);
      if (response.status === 404) {
        runInAction(() => {
          this.eventDetailNotFound.add(id);
          this.eventDetailLoaded.add(id);
        });
        return;
      }
      if (response.error || !response.data) {
        throw new Error(response.error ?? "Сервер вернул пустой ответ");
      }
      const event = normalize(response.data);
      runInAction(() => {
        const index = this.events.findIndex((item) => item.id === event.id);
        if (index === -1) this.events.push(event);
        else this.events[index] = event;
        this.eventDetailLoaded.add(id);
      });
    } catch (error) {
      runInAction(() => {
        this.eventDetailErrors.set(
          id,
          error instanceof Error ? error.message : "Не удалось загрузить событие",
        );
        this.eventDetailLoaded.add(id);
      });
    } finally {
      runInAction(() => {
        this.eventDetailLoading.delete(id);
      });
    }
  };

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
    startsAt: string;
    timezone: string;
    location?: string;
    category?: string;
    image?: string | null;
    coords?: [number, number];
    format?: "public" | "private";
  }): Promise<IEvent | null> => {
    runInAction(() => {
      this.actionError = null;
    });
    try {
      const body: EventWrite = {
        title: payload.title,
        description: payload.description ?? "",
        startsAt: payload.startsAt,
        timezone: payload.timezone,
        location: payload.location ?? "",
        category: payload.category,
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
        this.actionError = e instanceof Error ? e.message : "Не удалось создать событие";
      });
      return null;
    }
  };

  /** Записаться на событие: оптимистично обновляем UI, затем синхронизируем с API. */
  join = async (event: IEvent): Promise<boolean> => {
    runInAction(() => {
      this.actionError = null;
    });
    try {
      const response = await eventsAPI.join(event.id);
      if (response.error || !response.data) {
        throw new Error(response.error ?? "Не удалось записаться на событие");
      }
      const updated = normalize(response.data);
      runInAction(() => {
        const index = this.events.findIndex((item) => item.id === event.id);
        if (index !== -1) this.events[index] = updated;
        const acceptedIndex = this.acceptedEvents.findIndex((item) => item.id === event.id);
        if (acceptedIndex === -1) this.acceptedEvents.push(updated);
        else this.acceptedEvents[acceptedIndex] = updated;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.actionError = error instanceof Error ? error.message : "Не удалось записаться";
      });
      return false;
    }
  };

  /** Отписаться от события. */
  leave = async (event: IEvent): Promise<boolean> => {
    runInAction(() => {
      this.actionError = null;
    });
    try {
      const response = await eventsAPI.leave(event.id);
      if (response.error || !response.data) {
        throw new Error(response.error ?? "Не удалось отменить запись");
      }
      const updated = normalize(response.data);
      runInAction(() => {
        const index = this.events.findIndex((item) => item.id === event.id);
        if (index !== -1) this.events[index] = updated;
        this.acceptedEvents = this.acceptedEvents.filter((item) => item.id !== event.id);
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.actionError = error instanceof Error ? error.message : "Не удалось отменить запись";
      });
      return false;
    }
  };

  clearActionError(): void {
    this.actionError = null;
  }

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

  resetSessionState(): void {
    this.events = [];
    this.acceptedEvents = [];
    this.createdEvents = [];
    this.eventDetailLoading.clear();
    this.eventDetailLoaded.clear();
    this.eventDetailNotFound.clear();
    this.eventDetailErrors.clear();
    this.loaded = false;
    this.myEventsLoaded = false;
    this.error = null;
    this.myEventsError = null;
    this.actionError = null;
  }
}

export const eventStore = new EventStore();
