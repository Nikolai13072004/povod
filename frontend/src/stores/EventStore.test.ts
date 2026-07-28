import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getById: vi.fn(),
  delete: vi.fn(),
  create: vi.fn(),
}));

vi.mock("../services/api", () => ({ eventsAPI: api, favoritesAPI: {} }));

import { eventStore } from "./EventStore";

const event = (id: string) => ({
  id,
  title: `Событие ${id}`,
  description: "",
  startsAt: "2026-08-01T12:00:00.000Z",
  timezone: "Europe/Moscow",
  location: "",
  author: "Автор",
  authorId: "u1",
  participants: 1,
  participantIds: ["u1"],
  createdAt: "2026-07-01T00:00:00.000Z",
});

beforeEach(() => {
  eventStore.resetSessionState();
  vi.clearAllMocks();
  api.getById.mockResolvedValue({ data: event("42"), status: 200 });
  api.delete.mockResolvedValue({ status: 204 });
  api.create.mockResolvedValue({ data: event("new"), status: 201 });
});

describe("удаление события", () => {
  it("гасит кэш деталей, иначе страница события рендерит пустоту", async () => {
    await eventStore.fetchEventById("42");
    expect(eventStore.isEventDetailLoaded("42")).toBe(true);

    await eventStore.deleteEvent("42");

    // Раньше id оставался в eventDetailLoaded: fetchEventById молча выходил без
    // запроса, а самого события в сторе уже не было. Все guard-ы страницы
    // проваливались, и возврат по «Назад» давал белый экран без шапки.
    expect(eventStore.isEventDetailNotFound("42")).toBe(true);
    expect(eventStore.isEventDetailLoaded("42")).toBe(false);
    expect(eventStore.events.find((item) => item.id === "42")).toBeUndefined();
  });

  it("после удаления повторный запрос деталей снова идёт на сервер", async () => {
    await eventStore.fetchEventById("42");
    await eventStore.deleteEvent("42");

    api.getById.mockClear();
    await eventStore.fetchEventById("42");
    expect(api.getById).toHaveBeenCalledTimes(1);
  });
});

describe("создание события", () => {
  it("отправляет остаток выбранных категорий тегами", async () => {
    // Секция «Категории» — мультивыбор, а поле `category` в событии одно.
    // Остальные выбранные уезжали в никуда: автор отмечал три, сохранялась одна.
    await eventStore.createEvent({
      title: "Встреча",
      startsAt: "2026-08-01T12:00:00.000Z",
      timezone: "Europe/Moscow",
      category: "IT",
      tags: ["Наука", "Образование"],
    });

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: "IT", tags: ["Наука", "Образование"] }),
    );
  });

  it("не отправляет пустой массив тегов", async () => {
    await eventStore.createEvent({
      title: "Встреча",
      startsAt: "2026-08-01T12:00:00.000Z",
      timezone: "Europe/Moscow",
      category: "IT",
      tags: [],
    });

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ tags: undefined }));
  });
});
