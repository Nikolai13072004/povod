import { makeAutoObservable, runInAction } from "mobx";
import { notificationsAPI, type Notification } from "../services/api";

/**
 * Уведомления (PROD-003).
 *
 * Значок с числом непрочитанных нужен на каждом экране, а сама лента — только
 * при открытии колокольчика. Поэтому счётчик и список загружаются раздельно:
 * дешёвый запрос ходит часто, тяжёлый — по требованию.
 */
class NotificationsStore {
  items: Notification[] = [];
  unread = 0;
  isLoading = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Периодическое обновление счётчика.
   *
   * Раньше он обновлялся только при переходе между экранами: человек, сидящий
   * на ленте, о новом уведомлении не узнавал вовсе, пока куда-нибудь не
   * перейдёт. Минута — компромисс: значок перестаёт отставать, а нагрузка
   * остаётся одним крошечным запросом.
   *
   * Опрос идёт только при видимой вкладке. Фоновая вкладка всё равно ничего не
   * показывает, а на бесплатном хостинге каждый лишний запрос будит уснувший
   * сервис.
   */
  private pollTimer?: ReturnType<typeof setInterval>;

  startPolling(intervalMs = 60_000): void {
    this.stopPolling();
    const tick = () => {
      if (document.visibilityState === "visible") void this.refreshUnread();
    };
    this.pollTimer = setInterval(tick, intervalMs);
    // При возврате к вкладке — сразу, не дожидаясь следующего тика.
    document.addEventListener("visibilitychange", tick);
    this.visibilityHandler = tick;
  }

  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
  }

  private visibilityHandler?: () => void;

  /**
   * Счётчик для значка. Тихий во всех смыслах: ошибку не показываем, и сам вызов
   * не роняет вызвавшего. Его дёргают походя (после действий с дружбой, при входе
   * в чат) через `void`, и провал best-effort обновления значка не должен всплыть
   * необработанным отказом промиса там, где его никто не ждал.
   */
  refreshUnread = async (): Promise<void> => {
    try {
      const response = await notificationsAPI.unreadCount();
      if (response.data) {
        runInAction(() => {
          this.unread = response.data!.unread;
        });
      }
    } catch {
      // Сеть или мок в тесте могут бросить — значок не повод падать.
    }
  };

  load = async (): Promise<void> => {
    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });
    const response = await notificationsAPI.list();
    runInAction(() => {
      if (response.data) {
        this.items = response.data.items;
        this.unread = response.data.unread;
      } else {
        this.error = response.error ?? "Не удалось загрузить уведомления";
      }
      this.isLoading = false;
    });
  };

  markAllRead = async (): Promise<void> => {
    const unreadIds = this.items.filter((item) => !item.readAt).map((item) => item.id);
    if (unreadIds.length === 0) return;

    // Оптимистично: лента уже открыта, пользователь их видит. Возврат сервера
    // всё равно перезапишет счётчик, поэтому расхождение не задержится.
    const readAt = new Date().toISOString();
    runInAction(() => {
      this.items = this.items.map((item) => (item.readAt ? item : { ...item, readAt }));
      this.unread = 0;
    });

    const response = await notificationsAPI.markRead();
    if (response.data) {
      runInAction(() => {
        this.unread = response.data!.unread;
      });
    } else {
      // Не получилось — возвращаем счётчик, чтобы значок не врал.
      await this.refreshUnread();
    }
  };

  /**
   * Гасит одно уведомление — по клику на него.
   *
   * Раньше клик только переходил по ссылке, а само уведомление оставалось
   * непрочитанным: значок на колокольчике не уменьшался, и человеку приходилось
   * жать «Прочитать все». Теперь открытие уведомления и есть его прочтение.
   */
  markOneRead = async (id: string): Promise<void> => {
    const target = this.items.find((item) => item.id === id);
    if (!target || target.readAt) return; // уже прочитано — делать нечего

    // Оптимистично: пользователь только что на него нажал.
    const readAt = new Date().toISOString();
    runInAction(() => {
      this.items = this.items.map((item) => (item.id === id ? { ...item, readAt } : item));
      this.unread = Math.max(0, this.unread - 1);
    });

    const response = await notificationsAPI.markRead([id]);
    if (response.data) {
      runInAction(() => {
        this.unread = response.data!.unread;
      });
    } else {
      await this.refreshUnread();
    }
  };

  /**
   * «Очистить всё» — удаляет уведомления насовсем, а не просто гасит значок.
   *
   * Оптимистично: список опустошается сразу. При отказе перечитываем, чтобы
   * экран не остался пустым, когда на сервере записи на месте.
   */
  clearAll = async (): Promise<void> => {
    if (this.items.length === 0 && this.unread === 0) return;
    runInAction(() => {
      this.items = [];
      this.unread = 0;
    });
    const response = await notificationsAPI.clearAll();
    if (response.error) await this.load();
  };

  /** Выход из аккаунта: следующему пользователю чужие уведомления не нужны. */
  reset = (): void => {
    runInAction(() => {
      this.items = [];
      this.unread = 0;
      this.error = null;
    });
  };
}

export const notificationsStore = new NotificationsStore();
