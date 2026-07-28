import { makeAutoObservable, runInAction } from "mobx";
import { eventsAPI, type Event as ApiEvent, type EventWrite } from "../services/api";

/**
 * Внутренняя модель события. Расширена полем `place` (алиас `location`),
 * которым исторически пользуются страницы фронта, и строковым `id`.
 */
export interface IEvent {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  /** Окончание, если автор его указал (BE-006). */
  endsAt?: string;
  timezone: string;
  place?: string;
  location?: string;
  category?: string;
  image?: string | null;
  coords?: [number, number];
  participants?: number;
  /** Предел мест вместе с автором; отсутствует — предела нет (BE-007). */
  participantLimit?: number;
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
    endsAt: e.endsAt,
    timezone: e.timezone,
    location: e.location,
    place: e.location ?? (e as { place?: string }).place,
    category: e.category,
    image: e.image ?? null,
    coords: e.coords,
    participants: e.participants,
    participantLimit: e.participantLimit,
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
  /** Позиция следующей страницы ленты; пусто — дальше ничего нет (BE-003). */
  nextCursor: string | undefined = undefined;
  isLoadingMore = false;
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
      const items = res.data.items.map(normalize);
      runInAction(() => {
        this.events = items;
        this.nextCursor = res.data!.nextCursor;
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

  /**
   * Догрузка следующей страницы ленты (BE-003).
   *
   * Новые события дописываются к уже показанным, а не заменяют их: пользователь
   * нажал «Показать ещё», а не «обновить». Повторы отсекаются по id — на границе
   * страниц одно и то же событие теоретически может прийти дважды, если его
   * успели изменить между запросами.
   */
  loadMoreEvents = async (): Promise<void> => {
    if (this.isLoadingMore || !this.nextCursor) return;
    runInAction(() => {
      this.isLoadingMore = true;
      this.error = null;
    });
    try {
      const res = await eventsAPI.getAll({ cursor: this.nextCursor });
      if (res.error || !res.data) throw new Error(res.error ?? "Пустой ответ сервера");
      const incoming = res.data.items.map(normalize);
      runInAction(() => {
        const known = new Set(this.events.map((event) => event.id));
        this.events = [...this.events, ...incoming.filter((event) => !known.has(event.id))];
        this.nextCursor = res.data!.nextCursor;
        this.isLoadingMore = false;
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : "Не удалось загрузить ещё события";
        this.isLoadingMore = false;
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
  /**
   * `inviteToken` — секрет из ссылки-приглашения (BE-008). Без него закрытое
   * чужое событие отвечает 404 и не подтверждает даже своё существование.
   */
  fetchEventById = async (id: string, force = false, inviteToken?: string): Promise<void> => {
    if (this.eventDetailLoading.has(id)) return;
    if (this.eventDetailLoaded.has(id) && !force) return;

    runInAction(() => {
      this.eventDetailLoading.add(id);
      this.eventDetailErrors.delete(id);
      this.eventDetailNotFound.delete(id);
    });

    try {
      const response = await eventsAPI.getById(id, inviteToken);
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
    endsAt?: string;
    participantLimit?: number;
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
        endsAt: payload.endsAt,
        participantLimit: payload.participantLimit,
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

  /** Редактирование собственного события (FE-007). Права проверяет сервер. */
  updateEvent = async (
    id: string,
    patch: {
      title?: string;
      description?: string;
      startsAt?: string;
      timezone?: string;
      location?: string;
      category?: string;
      image?: string;
      format?: "public" | "private";
    },
  ): Promise<IEvent | null> => {
    runInAction(() => {
      this.actionError = null;
    });
    try {
      const response = await eventsAPI.update(id, patch);
      if (response.error || !response.data) {
        throw new Error(response.error ?? "Не удалось сохранить изменения");
      }
      const updated = normalize(response.data);
      runInAction(() => {
        for (const list of [this.events, this.createdEvents, this.acceptedEvents]) {
          const index = list.findIndex((item) => item.id === id);
          if (index !== -1) list[index] = updated;
        }
      });
      return updated;
    } catch (error) {
      runInAction(() => {
        this.actionError =
          error instanceof Error ? error.message : "Не удалось сохранить изменения";
      });
      return null;
    }
  };

  /** Удаление собственного события (FE-007). Права проверяет сервер. */
  deleteEvent = async (id: string): Promise<boolean> => {
    runInAction(() => {
      this.actionError = null;
    });
    try {
      const response = await eventsAPI.delete(id);
      if (response.error) throw new Error(response.error);
      runInAction(() => {
        this.events = this.events.filter((item) => item.id !== id);
        this.createdEvents = this.createdEvents.filter((item) => item.id !== id);
        this.acceptedEvents = this.acceptedEvents.filter((item) => item.id !== id);
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.actionError = error instanceof Error ? error.message : "Не удалось удалить событие";
      });
      return false;
    }
  };

  /** Записаться на событие: оптимистично обновляем UI, затем синхронизируем с API. */
  join = async (event: IEvent, inviteToken?: string): Promise<boolean> => {
    runInAction(() => {
      this.actionError = null;
    });
    try {
      const response = await eventsAPI.join(event.id, inviteToken);
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
