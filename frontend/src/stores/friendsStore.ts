import { makeAutoObservable, runInAction } from "mobx";
import { usersAPI, type User } from "../services/api";

/**
 * Связи с людьми: друзья и заявки (SEC-012, SEC-015).
 *
 * До этого состояние дружбы было скопировано в локальный `useState` трёх
 * компонентов и заполнялось ровно один раз, при монтировании. Ни один экземпляр
 * не узнавал ни о действиях соседнего экрана, ни о действиях второго человека,
 * и единственным способом всё синхронизировать была перезагрузка страницы —
 * что пользователь и делал.
 *
 * Здесь состояние одно, как у уведомлений и переписки, и обновляется по тем же
 * правилам: опрос при видимой вкладке плюс явное перечитывание после каждого
 * действия.
 */

/**
 * Связь с конкретным человеком.
 *
 * `unknown` существует отдельно от `none` намеренно. Пока ответ сервера не
 * пришёл, «не друзья» — это не факт, а домысел: у настоящего друга рисовалась
 * кнопка «Добавить в друзья», нажатие возвращало `already-friends`, и статус
 * прыгал обратно. Снаружи это выглядело как «пока не обновишь страницу,
 * показывает неправду».
 */
export type LinkState = "unknown" | "none" | "outgoing" | "incoming" | "friends";

const POLL_MS = 60_000;

class FriendsStore {
  friends: User[] = [];
  incoming: User[] = [];
  outgoing: User[] = [];
  loaded = false;
  isLoading = false;
  error: string | null = null;

  private generation = 0;
  private timer?: ReturnType<typeof setInterval>;
  private visibility?: () => void;

  constructor() {
    makeAutoObservable(this);
  }

  private stale(generation: number): boolean {
    return generation !== this.generation;
  }

  load = async (userId: string, force = false): Promise<void> => {
    if (!userId) return;
    if (this.isLoading || (this.loaded && !force)) return;
    runInAction(() => {
      this.isLoading = true;
    });

    const generation = this.generation;
    const [friends, requests] = await Promise.all([
      usersAPI.getFriends(userId),
      usersAPI.getFriendRequests(userId),
    ]);

    runInAction(() => {
      if (this.stale(generation)) return;
      this.isLoading = false;
      /*
       * Ошибка НЕ затирает уже известные списки: холодный старт бесплатного
       * хостинга роняет один запрос из двух сплошь и рядом, а обнулить связи
       * из-за этого значит показать человеку, что друзей у него нет.
       */
      if (!friends.data || !requests.data) {
        this.error = friends.error ?? requests.error ?? "Не удалось обновить связи";
        return;
      }
      this.friends = friends.data;
      this.incoming = requests.data.incoming;
      this.outgoing = requests.data.outgoing;
      this.loaded = true;
      this.error = null;
    });
  };

  /** Связь с человеком; `unknown`, пока списки не загружены. */
  linkTo(peerId: string): LinkState {
    if (!this.loaded) return "unknown";
    if (this.friends.some((person) => person.id === peerId)) return "friends";
    if (this.outgoing.some((person) => person.id === peerId)) return "outgoing";
    if (this.incoming.some((person) => person.id === peerId)) return "incoming";
    return "none";
  }

  /**
   * Отправляет заявку либо принимает встречную — сервер решает сам, и ответ
   * говорит, чем кончилось.
   */
  request = async (userId: string, peerId: string): Promise<LinkState | null> => {
    const response = await usersAPI.addFriend(userId, peerId);
    if (!response.data) return null;
    // Перечитываем целиком: после принятия меняются сразу три списка, и
    // угадывать их состав на клиенте — верный способ разойтись с сервером.
    await this.load(userId, true);
    return response.data.status === "accepted" ? "friends" : "outgoing";
  };

  /** Одно действие на три случая: расторгнуть дружбу, отклонить и отозвать заявку. */
  remove = async (userId: string, peerId: string): Promise<boolean> => {
    const response = await usersAPI.removeFriend(userId, peerId);
    if (response.error) return false;
    await this.load(userId, true);
    return true;
  };

  accept = async (userId: string, requesterId: string): Promise<boolean> => {
    const response = await usersAPI.acceptFriendRequest(userId, requesterId);
    if (response.error) return false;
    await this.load(userId, true);
    return true;
  };

  /**
   * Опрос при видимой вкладке — тот же приём, что у уведомлений.
   *
   * Нужен ради второго человека: пока экран открыт, его действия — принял
   * заявку, убрал из друзей — иначе видны только после перезагрузки.
   */
  startPolling = (userId: string, intervalMs = POLL_MS): void => {
    this.stopPolling();
    const tick = () => {
      if (document.visibilityState === "visible") void this.load(userId, true);
    };
    this.timer = setInterval(tick, intervalMs);
    // При возврате к вкладке — сразу: именно так человек и переключается между
    // двумя аккаунтами в соседних окнах.
    document.addEventListener("visibilitychange", tick);
    this.visibility = tick;
  };

  stopPolling = (): void => {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.visibility) {
      document.removeEventListener("visibilitychange", this.visibility);
      this.visibility = undefined;
    }
  };

  reset = (): void => {
    this.stopPolling();
    runInAction(() => {
      this.generation += 1;
      this.friends = [];
      this.incoming = [];
      this.outgoing = [];
      this.loaded = false;
      this.isLoading = false;
      this.error = null;
    });
  };
}

export const friendsStore = new FriendsStore();
