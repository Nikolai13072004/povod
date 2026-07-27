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

  /** Счётчик для значка. Тихий: ошибку не показываем — значок не стоит паники. */
  refreshUnread = async (): Promise<void> => {
    const response = await notificationsAPI.unreadCount();
    if (response.data) {
      runInAction(() => {
        this.unread = response.data!.unread;
      });
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
