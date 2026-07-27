import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));

vi.mock("../services/api", () => ({ eventsAPI: api }));

import { favoritesStore } from "./favoritesStore";

const event = (id: string) => ({ id, title: `Событие ${id}` });

beforeEach(() => {
  favoritesStore.reset();
  api.getFavorites.mockResolvedValue({ data: [event("1")], status: 200 });
  api.addFavorite.mockResolvedValue({ status: 204 });
  api.removeFavorite.mockResolvedValue({ status: 204 });
});

describe("избранное", () => {
  it("загружает список и признак «в избранном» вместе", async () => {
    await favoritesStore.load();

    expect(favoritesStore.items).toHaveLength(1);
    expect(favoritesStore.has("1")).toBe(true);
    expect(favoritesStore.has("2")).toBe(false);
  });

  it("переключает отметку сразу, не дожидаясь ответа сервера", async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    api.addFavorite.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const pending = favoritesStore.toggle("7");
    // Сердечко должно откликаться мгновенно — иначе нажатие кажется потерянным.
    expect(favoritesStore.has("7")).toBe(true);
    expect(favoritesStore.isPending("7")).toBe(true);

    resolveRequest({ status: 204 });
    await pending;
    expect(favoritesStore.isPending("7")).toBe(false);
    expect(favoritesStore.has("7")).toBe(true);
  });

  it("возвращает состояние, если сервер отказал", async () => {
    api.addFavorite.mockResolvedValue({ error: "Event not found", status: 404 });

    await favoritesStore.toggle("404");

    // Иначе интерфейс показывал бы то, чего на сервере нет, а пользователь
    // узнал бы об этом только после перезагрузки.
    expect(favoritesStore.has("404")).toBe(false);
    expect(favoritesStore.error).toBe("Event not found");
  });

  it("убирает событие из уже загруженного списка при снятии отметки", async () => {
    await favoritesStore.load();
    await favoritesStore.toggle("1");

    expect(favoritesStore.has("1")).toBe(false);
    expect(favoritesStore.items).toHaveLength(0);
    expect(api.removeFavorite).toHaveBeenCalledWith("1");
  });

  it("не отправляет второй запрос, пока идёт первый", async () => {
    api.addFavorite.mockReturnValue(new Promise(() => {}));

    void favoritesStore.toggle("9");
    void favoritesStore.toggle("9");

    // Двойное нажатие иначе успело бы отправить add и remove вперемешку.
    expect(api.addFavorite).toHaveBeenCalledTimes(1);
    expect(api.removeFavorite).not.toHaveBeenCalled();
  });

  it("очищается при выходе из аккаунта", async () => {
    await favoritesStore.load();
    favoritesStore.reset();

    expect(favoritesStore.items).toHaveLength(0);
    expect(favoritesStore.has("1")).toBe(false);
  });
});
