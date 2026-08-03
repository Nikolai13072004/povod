import { makeAutoObservable, runInAction } from "mobx";
import { eventChatAPI, type EventMessage } from "../services/api";

/**
 * Чат участников события (PROD-013).
 *
 * Устроен как переписка (`chatStore`), но проще: нет непрочитанных и списка
 * диалогов — комната одна на событие, а право в ней выводится из участия. Если
 * доступ пропал (человек ушёл с события или чат выключили), сервер отвечает 404,
 * и это становится `notFound`: экран объясняет, а не показывает пустоту.
 */

const PAGE_SIZE = 30;
const POLL_MS = 15_000;

interface RoomState {
  eventTitle: string;
  messages: EventMessage[];
  loading: boolean;
  loaded: boolean;
  loadingMore: boolean;
  sending: boolean;
  error: string | null;
  sendError: string | null;
  notFound: boolean;
  nextCursor?: string;
}

function emptyRoom(): RoomState {
  return {
    eventTitle: "",
    messages: [],
    loading: false,
    loaded: false,
    loadingMore: false,
    sending: false,
    error: null,
    sendError: null,
    notFound: false,
    nextCursor: undefined,
  };
}

/** Свежие первыми; при равной метке порядок решает id, чтобы он был строгим. */
function newestFirst(left: EventMessage, right: EventMessage): number {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? 1 : -1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

/**
 * Слияние с дедупликацией по id: опрос перезапрашивает первую страницу целиком,
 * а только что отправленное придёт и следующим тиком. `authoritative` — пришла
 * первая страница: сообщение из её отрезка, которого в ней нет, удалено.
 */
function mergeMessages(
  current: EventMessage[],
  incoming: EventMessage[],
  authoritative = false,
): EventMessage[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  if (authoritative && incoming.length > 0) {
    const known = new Set(incoming.map((item) => item.id));
    const oldest = incoming[incoming.length - 1]!;
    for (const [id, item] of byId) {
      if (known.has(id)) continue;
      if (newestFirst(item, oldest) <= 0) byId.delete(id);
    }
  }
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort(newestFirst);
}

class EventChatStore {
  private rooms = new Map<string, RoomState>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private visibility: (() => void) | undefined;
  /** Растёт при выходе из аккаунта: всё, что вернётся после, уже устарело. */
  private generation = 0;

  constructor() {
    makeAutoObservable(this);
  }

  room(eventId: string): RoomState {
    return this.rooms.get(eventId) ?? emptyRoom();
  }

  private patch(eventId: string, partial: Partial<RoomState>): void {
    this.rooms.set(eventId, { ...this.room(eventId), ...partial });
  }

  private stale(generation: number): boolean {
    return generation !== this.generation;
  }

  load = async (eventId: string, force = false): Promise<void> => {
    const current = this.room(eventId);
    if (current.loading || (current.loaded && !force)) return;
    runInAction(() => this.patch(eventId, { loading: true, error: null }));

    const generation = this.generation;
    const response = await eventChatAPI.getChat(eventId, { limit: PAGE_SIZE });
    runInAction(() => {
      if (this.stale(generation)) return;
      if (response.data) {
        this.patch(eventId, {
          eventTitle: response.data.eventTitle,
          messages: [...response.data.items].sort(newestFirst),
          nextCursor: response.data.nextCursor,
          loading: false,
          loaded: true,
          notFound: false,
          error: null,
        });
      } else if (response.status === 404) {
        // «Нет события», «чат выключен», «вы не участник» — один ответ.
        this.patch(eventId, { loading: false, loaded: true, notFound: true });
      } else {
        this.patch(eventId, {
          loading: false,
          error: response.error ?? "Не удалось загрузить чат",
        });
      }
    });
  };

  loadOlder = async (eventId: string): Promise<void> => {
    const current = this.room(eventId);
    if (current.loadingMore || !current.nextCursor) return;
    runInAction(() => this.patch(eventId, { loadingMore: true }));

    const generation = this.generation;
    const response = await eventChatAPI.getChat(eventId, {
      cursor: current.nextCursor,
      limit: PAGE_SIZE,
    });
    runInAction(() => {
      if (this.stale(generation)) return;
      const room = this.room(eventId);
      if (response.data) {
        this.patch(eventId, {
          messages: mergeMessages(room.messages, response.data.items),
          nextCursor: response.data.nextCursor,
          loadingMore: false,
        });
      } else {
        this.patch(eventId, {
          loadingMore: false,
          error: response.error ?? "Не удалось загрузить историю",
        });
      }
    });
  };

  send = async (eventId: string, text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed || this.room(eventId).sending) return false;
    runInAction(() => this.patch(eventId, { sending: true, sendError: null }));

    const generation = this.generation;
    const response = await eventChatAPI.send(eventId, trimmed);
    runInAction(() => {
      if (this.stale(generation)) return;
      const room = this.room(eventId);
      if (response.data) {
        this.patch(eventId, {
          messages: mergeMessages(room.messages, [response.data]),
          sending: false,
        });
      } else {
        this.patch(eventId, {
          sending: false,
          // 404 — доступ пропал (ушёл с события или чат выключили).
          notFound: response.status === 404 ? true : room.notFound,
          sendError:
            response.status === 404
              ? "Писать больше нельзя: вы не участник события"
              : (response.error ?? "Не удалось отправить сообщение"),
        });
      }
    });
    return Boolean(response.data);
  };

  remove = async (eventId: string, messageId: string): Promise<boolean> => {
    const generation = this.generation;
    const response = await eventChatAPI.remove(eventId, messageId);
    if (response.error) return false;
    runInAction(() => {
      if (this.stale(generation)) return;
      const room = this.room(eventId);
      this.patch(eventId, {
        messages: room.messages.filter((item) => item.id !== messageId),
      });
    });
    return true;
  };

  startPolling = (eventId: string): void => {
    this.stopPolling();
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const generation = this.generation;
      const response = await eventChatAPI.getChat(eventId, { limit: PAGE_SIZE }).catch(() => null);
      if (!response?.data || this.stale(generation)) return;
      runInAction(() => {
        const room = this.room(eventId);
        this.patch(eventId, {
          messages: mergeMessages(room.messages, response.data!.items, true),
          eventTitle: response.data!.eventTitle,
        });
      });
    };
    this.timer = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    this.visibility = onVisible;
  };

  stopPolling = (): void => {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.visibility) {
      document.removeEventListener("visibilitychange", this.visibility);
      this.visibility = undefined;
    }
  };

  /** Выход из аккаунта: чужой чат не должен достаться следующему. */
  reset = (): void => {
    this.stopPolling();
    runInAction(() => {
      this.generation += 1;
      this.rooms = new Map();
    });
  };
}

export const eventChatStore = new EventChatStore();
