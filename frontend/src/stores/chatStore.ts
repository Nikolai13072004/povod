import { makeAutoObservable, runInAction } from "mobx";
import {
  messagesAPI,
  type Dialog,
  type DirectMessage,
  type MessageThread,
  type User,
} from "../services/api";

/**
 * Личные сообщения (PROD-011).
 *
 * Живого канала в проекте нет и не будет: на бесплатном Render сервис засыпает
 * через 15 минут простоя, и постоянное соединение превратилось бы в бесконечный
 * цикл «отвалилось — переподключаемся». Поэтому здесь опрос — тот же приём, что
 * у счётчика уведомлений, и с той же оговоркой: только при видимой вкладке.
 *
 * Опрос в двух режимах. Счётчик непрочитанных — раз в минуту, на любом экране.
 * Открытая переписка — раз в 15 секунд, потому что задержка в минуту внутри
 * диалога ощущается как поломка.
 */

/** Сколько сообщений в странице. Совпадает с умолчанием сервера. */
const PAGE_SIZE = 30;

const UNREAD_POLL_MS = 60_000;
const THREAD_POLL_MS = 15_000;

export interface ThreadState {
  peer?: User;
  /** Свежие сообщения первыми — в том же порядке, что отдаёт сервер. */
  messages: DirectMessage[];
  loading: boolean;
  loadingMore: boolean;
  sending: boolean;
  error: string | null;
  sendError: string | null;
  loaded: boolean;
  /** Собеседника нет, он не друг и переписки не было — снаружи это одно и то же. */
  notFound: boolean;
  nextCursor?: string;
  /** Дружба подтверждена прямо сейчас. Ложь — история видна, отправка закрыта. */
  canSend: boolean;
}

const emptyThread = (): ThreadState => ({
  messages: [],
  loading: false,
  loadingMore: false,
  sending: false,
  error: null,
  sendError: null,
  loaded: false,
  notFound: false,
  canSend: false,
});

class ChatStore {
  dialogs: Dialog[] = [];
  dialogsLoading = false;
  dialogsError: string | null = null;
  dialogsLoaded = false;
  /** Живёт в сторе, а не в компоненте: уход на другую вкладку не должен его терять. */
  search = "";
  unread = 0;

  threads = new Map<string, ThreadState>();

  private unreadTimer?: ReturnType<typeof setInterval>;
  private unreadVisibility?: () => void;
  private threadTimer?: ReturnType<typeof setInterval>;
  private threadVisibility?: () => void;

  constructor() {
    makeAutoObservable(this);
  }

  thread(peerId: string): ThreadState {
    return this.threads.get(peerId) ?? emptyThread();
  }

  private patchThread(peerId: string, patch: Partial<ThreadState>): void {
    const current = this.threads.get(peerId) ?? emptyThread();
    this.threads.set(peerId, { ...current, ...patch });
  }

  setSearch = (value: string): void => {
    this.search = value;
  };

  /** Диалоги, отфильтрованные строкой поиска. Фильтр локальный: их не больше 50. */
  get visibleDialogs(): Dialog[] {
    const query = this.search.trim().toLocaleLowerCase("ru");
    if (!query) return this.dialogs;
    return this.dialogs.filter((dialog) =>
      dialog.peer.name.toLocaleLowerCase("ru").includes(query),
    );
  }

  loadDialogs = async (force = false): Promise<void> => {
    if (this.dialogsLoading || (this.dialogsLoaded && !force)) return;
    runInAction(() => {
      this.dialogsLoading = true;
      this.dialogsError = null;
    });

    const response = await messagesAPI.getDialogs();
    runInAction(() => {
      if (response.data) {
        this.dialogs = response.data.items;
        this.unread = response.data.unread;
        this.dialogsLoaded = true;
      } else {
        this.dialogsError = response.error ?? "Не удалось загрузить переписки";
      }
      this.dialogsLoading = false;
    });
  };

  loadThread = async (peerId: string, force = false): Promise<void> => {
    const current = this.thread(peerId);
    if (current.loading || (current.loaded && !force)) return;
    runInAction(() => {
      this.patchThread(peerId, { loading: true, error: null });
    });

    const response = await messagesAPI.getThread(peerId, { limit: PAGE_SIZE });
    runInAction(() => {
      if (response.data) {
        this.applyThread(peerId, response.data);
      } else if (response.status === 404) {
        this.patchThread(peerId, { loading: false, loaded: true, notFound: true });
      } else {
        this.patchThread(peerId, {
          loading: false,
          error: response.error ?? "Не удалось загрузить переписку",
        });
      }
    });
  };

  private applyThread(peerId: string, page: MessageThread): void {
    this.patchThread(peerId, {
      peer: page.peer,
      messages: page.items,
      nextCursor: page.nextCursor,
      canSend: page.canSend,
      loading: false,
      loaded: true,
      notFound: false,
      error: null,
    });
  }

  /** Страница вглубь истории. */
  loadOlder = async (peerId: string): Promise<void> => {
    const current = this.thread(peerId);
    if (current.loadingMore || !current.nextCursor) return;
    runInAction(() => {
      this.patchThread(peerId, { loadingMore: true });
    });

    const response = await messagesAPI.getThread(peerId, {
      cursor: current.nextCursor,
      limit: PAGE_SIZE,
    });
    runInAction(() => {
      const thread = this.thread(peerId);
      if (response.data) {
        this.patchThread(peerId, {
          messages: mergeMessages(thread.messages, response.data.items),
          nextCursor: response.data.nextCursor,
          loadingMore: false,
        });
      } else {
        this.patchThread(peerId, {
          loadingMore: false,
          error: response.error ?? "Не удалось загрузить историю",
        });
      }
    });
  };

  /**
   * Отправка без оптимистичной вставки.
   *
   * Пузырь появляется только после ответа сервера: при отказе — а он бывает,
   * дружбу могли расторгнуть минуту назад — пришлось бы выдёргивать уже
   * отрисованное сообщение, и человек успел бы решить, что оно ушло.
   */
  send = async (peerId: string, text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed || this.thread(peerId).sending) return false;
    runInAction(() => {
      this.patchThread(peerId, { sending: true, sendError: null });
    });

    const response = await messagesAPI.send(peerId, trimmed);
    runInAction(() => {
      const thread = this.thread(peerId);
      if (response.data) {
        this.patchThread(peerId, {
          messages: mergeMessages(thread.messages, [response.data]),
          sending: false,
        });
        this.touchDialog(peerId, response.data);
      } else {
        this.patchThread(peerId, {
          sending: false,
          sendError:
            response.status === 404
              ? "Написать не получилось: вы больше не друзья"
              : (response.error ?? "Не удалось отправить сообщение"),
          // Сервер уже знает, что дружбы нет; интерфейс обязан узнать тоже.
          canSend: response.status === 404 ? false : thread.canSend,
        });
      }
    });
    return Boolean(response.data);
  };

  edit = async (peerId: string, messageId: string, text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const response = await messagesAPI.update(messageId, trimmed);
    if (!response.data) return false;
    runInAction(() => {
      const thread = this.thread(peerId);
      this.patchThread(peerId, {
        messages: thread.messages.map((item) => (item.id === messageId ? response.data! : item)),
      });
    });
    return true;
  };

  remove = async (peerId: string, messageId: string): Promise<boolean> => {
    const response = await messagesAPI.remove(messageId);
    if (response.error) return false;
    runInAction(() => {
      const thread = this.thread(peerId);
      this.patchThread(peerId, {
        messages: thread.messages.filter((item) => item.id !== messageId),
      });
    });
    return true;
  };

  /** Поднимает диалог наверх списка, не перезапрашивая его целиком. */
  private touchDialog(peerId: string, message: DirectMessage): void {
    const index = this.dialogs.findIndex((dialog) => dialog.peer.id === peerId);
    if (index < 0) return;
    const dialog = { ...this.dialogs[index]!, lastMessage: message };
    this.dialogs = [dialog, ...this.dialogs.filter((_, position) => position !== index)];
  }

  /**
   * Отметка о прочтении.
   *
   * Оптимистичная: диалог открыт, человек их видит. При отказе счётчик
   * возвращается запросом — иначе значок останется нулевым при непрочитанных и
   * не вернётся до перезагрузки.
   */
  markRead = async (peerId: string): Promise<void> => {
    const dialog = this.dialogs.find((item) => item.peer.id === peerId);
    const wasUnread = dialog?.unread ?? 0;
    if (wasUnread > 0) {
      runInAction(() => {
        this.dialogs = this.dialogs.map((item) =>
          item.peer.id === peerId ? { ...item, unread: 0 } : item,
        );
        this.unread = Math.max(0, this.unread - wasUnread);
      });
    }

    const response = await messagesAPI.markRead(peerId);
    if (response.error) {
      await this.refreshUnread();
      return;
    }
    // Даже если локально непрочитанных не значилось, на сервере они могли быть:
    // экран открыт напрямую по ссылке, список диалогов при этом не загружен.
    if (wasUnread === 0) await this.refreshUnread();
  };

  /** Тихий: ошибку не показываем — значок не стоит паники, а 401 выкинет из аккаунта. */
  refreshUnread = async (): Promise<void> => {
    const response = await messagesAPI.unreadCount();
    if (response.data) {
      runInAction(() => {
        this.unread = response.data!.unread;
      });
    }
  };

  startUnreadPolling = (intervalMs = UNREAD_POLL_MS): void => {
    this.stopUnreadPolling();
    const tick = () => {
      if (document.visibilityState === "visible") void this.refreshUnread();
    };
    this.unreadTimer = setInterval(tick, intervalMs);
    // При возврате к вкладке — сразу, не дожидаясь следующего тика.
    document.addEventListener("visibilitychange", tick);
    this.unreadVisibility = tick;
  };

  stopUnreadPolling = (): void => {
    if (this.unreadTimer) clearInterval(this.unreadTimer);
    this.unreadTimer = undefined;
    if (this.unreadVisibility) {
      document.removeEventListener("visibilitychange", this.unreadVisibility);
      this.unreadVisibility = undefined;
    }
  };

  /**
   * Опрос открытой переписки.
   *
   * Перезапрашивается ПЕРВАЯ страница и вливается с дедупликацией по `id`.
   * Отдельный режим «только новее такого-то» — это вторая ветка SQL и вторая
   * пачка тестов ради экономии, которая на тридцати сообщениях не окупается.
   */
  startThreadPolling = (peerId: string, intervalMs = THREAD_POLL_MS): void => {
    this.stopThreadPolling();
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const response = await messagesAPI.getThread(peerId, { limit: PAGE_SIZE });
      if (!response.data) return;
      const incoming = response.data.items;
      runInAction(() => {
        const thread = this.thread(peerId);
        this.patchThread(peerId, {
          messages: mergeMessages(thread.messages, incoming),
          canSend: response.data!.canSend,
          peer: response.data!.peer,
        });
      });
      // Пришло новое входящее, а экран открыт — значит оно уже прочитано.
      if (incoming.some((item) => item.recipientId !== peerId && !item.readAt)) {
        await this.markRead(peerId);
      }
    };
    this.threadTimer = setInterval(() => void tick(), intervalMs);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    this.threadVisibility = onVisible;
  };

  stopThreadPolling = (): void => {
    if (this.threadTimer) clearInterval(this.threadTimer);
    this.threadTimer = undefined;
    if (this.threadVisibility) {
      document.removeEventListener("visibilitychange", this.threadVisibility);
      this.threadVisibility = undefined;
    }
  };

  /** Выход из аккаунта: чужая переписка не должна достаться следующему. */
  reset = (): void => {
    this.stopUnreadPolling();
    this.stopThreadPolling();
    runInAction(() => {
      this.dialogs = [];
      this.dialogsLoaded = false;
      this.dialogsError = null;
      this.search = "";
      this.unread = 0;
      this.threads = new Map();
    });
  };
}

/**
 * Слияние страниц с дедупликацией по `id` и сортировкой «свежие первыми».
 *
 * Дубли неизбежны: опрос перезапрашивает первую страницу целиком, а отправка
 * добавляет сообщение, которое придёт и следующим тиком.
 */
function mergeMessages(current: DirectMessage[], incoming: DirectMessage[]): DirectMessage[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? 1 : -1;
    // При равной метке порядок решает id — иначе он не строгий, и список прыгает.
    if (left.id === right.id) return 0;
    return left.id < right.id ? 1 : -1;
  });
}

export const chatStore = new ChatStore();
