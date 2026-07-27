import { makeAutoObservable, runInAction } from "mobx";
import { eventsAPI, type Event } from "../services/api";

/**
 * Избранные события (PROD-001).
 *
 * Признак «в избранном» хранится здесь множеством идентификаторов, а не полем
 * внутри каждого события. Иначе один и тот же признак пришлось бы поддерживать
 * в ленте, в карточке события, в «Моих событиях» и в профиле автора —
 * и рано или поздно они бы разошлись.
 */
class FavoritesStore {
  items: Event[] = [];
  ids = new Set<string>();
  isLoading = false;
  error: string | null = null;
  /** Идентификаторы, по которым сейчас идёт запрос: защита от двойного нажатия. */
  private pending = new Set<string>();

  constructor() {
    makeAutoObservable(this);
  }

  has(eventId: string): boolean {
    return this.ids.has(eventId);
  }

  isPending(eventId: string): boolean {
    return this.pending.has(eventId);
  }

  load = async (): Promise<void> => {
    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });
    const response = await eventsAPI.getFavorites();
    runInAction(() => {
      if (response.data) {
        this.items = response.data;
        this.ids = new Set(response.data.map((event) => event.id));
      } else {
        this.error = response.error ?? "Не удалось загрузить избранное";
      }
      this.isLoading = false;
    });
  };

  /**
   * Переключает отметку оптимистично: сердечко должно откликаться мгновенно.
   * При ошибке состояние возвращается — иначе интерфейс покажет то, чего нет
   * на сервере, и пользователь узнает об этом только после перезагрузки.
   */
  toggle = async (eventId: string): Promise<boolean> => {
    if (this.pending.has(eventId)) return this.ids.has(eventId);

    const wasFavorite = this.ids.has(eventId);
    runInAction(() => {
      this.pending.add(eventId);
      this.applyLocally(eventId, !wasFavorite);
    });

    const response = wasFavorite
      ? await eventsAPI.removeFavorite(eventId)
      : await eventsAPI.addFavorite(eventId);

    runInAction(() => {
      this.pending.delete(eventId);
      if (response.error) {
        this.applyLocally(eventId, wasFavorite);
        this.error = response.error;
      }
    });
    return this.ids.has(eventId);
  };

  /**
   * Локально меняется только признак и уже загруженный список. Добавленное
   * событие в `items` не подставляется: раздел «Избранное» перечитывает список
   * с сервера при открытии, а собирать его здесь из чужих представлений события
   * значило бы завести второй источник правды.
   */
  private applyLocally(eventId: string, favorite: boolean): void {
    // Set и массив пересоздаются, а не мутируются: MobX отслеживает ссылку.
    const ids = new Set(this.ids);
    if (favorite) {
      ids.add(eventId);
    } else {
      ids.delete(eventId);
      this.items = this.items.filter((item) => item.id !== eventId);
    }
    this.ids = ids;
  }

  /** Выход из аккаунта: избранное следующего пользователя — не это. */
  reset = (): void => {
    runInAction(() => {
      this.items = [];
      this.ids = new Set();
      this.error = null;
    });
  };
}

export const favoritesStore = new FavoritesStore();
