import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogList, DirectMessage, MessageThread } from "../services/api";

/**
 * Стор переписки (PROD-011).
 *
 * Здесь проверяется то, что разошлось бы молча: слияние страниц опроса,
 * очистка при смене пользователя и гонка ответов, пришедших уже после выхода.
 */

const api = vi.hoisted(() => ({
  getDialogs: vi.fn(),
  unreadCount: vi.fn(),
  getThread: vi.fn(),
  send: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("../services/api", () => ({ messagesAPI: api }));

import { chatStore } from "./chatStore";

const message = (overrides: Partial<DirectMessage> = {}): DirectMessage => ({
  id: "m1",
  senderId: "u2",
  recipientId: "u1",
  text: "привет",
  createdAt: "2026-07-01T10:00:00.000Z",
  ...overrides,
});

const thread = (items: DirectMessage[], overrides: Partial<MessageThread> = {}): MessageThread => ({
  peer: { id: "u2", name: "Сергей", createdAt: "2026-01-01T00:00:00.000Z" },
  items,
  canSend: true,
  ...overrides,
});

const ok = <T>(data: T) => ({ data, status: 200 });

beforeEach(() => {
  vi.clearAllMocks();
  chatStore.reset();
  api.markRead.mockResolvedValue({ status: 204 });
  api.unreadCount.mockResolvedValue(ok({ unread: 0 }));
  // Умолчания на все методы: без них исчерпанный mockResolvedValueOnce
  // возвращает undefined, и тик опроса падает необработанным отказом.
  api.getThread.mockResolvedValue(ok(thread([])));
  api.getDialogs.mockResolvedValue(ok<DialogList>({ items: [], unread: 0 }));
});

describe("слияние страниц", () => {
  it("удалённое собеседником сообщение исчезает с экрана", async () => {
    /*
     * Слияние только добавляло записи и никогда не убирало, поэтому удалённый
     * пузырь висел бессрочно: повторный вход на экран упирался в `loaded`, а
     * опрос лишь дописывал пришедшее поверх старого.
     */
    const first = message({ id: "a", createdAt: "2026-07-01T10:00:00.000Z" });
    const second = message({ id: "b", createdAt: "2026-07-01T10:00:01.000Z" });

    api.getThread.mockResolvedValue(ok(thread([second, first])));
    await chatStore.loadThread("u2");
    expect(chatStore.thread("u2").messages).toHaveLength(2);

    // Собеседник удалил своё «b» — опрос приносит первую страницу без него.
    // mockResolvedValue, а не Once: тиков может быть несколько, и все они
    // обязаны давать один и тот же ответ.
    api.getThread.mockResolvedValue(ok(thread([first])));
    chatStore.startThreadPolling("u2", 1);
    await vi.waitFor(() =>
      expect(chatStore.thread("u2").messages.map((item) => item.id)).toEqual(["a"]),
    );
    chatStore.stopThreadPolling();
  });

  it("подгруженная история не стирается следующим опросом", async () => {
    // Страница опроса авторитетна только для своего отрезка: всё, что глубже,
    // лежит на непрошенных страницах и трогать его нельзя.
    const old = message({ id: "old", createdAt: "2026-06-01T10:00:00.000Z" });
    const fresh = message({ id: "fresh", createdAt: "2026-07-01T10:00:00.000Z" });

    api.getThread.mockResolvedValueOnce(ok(thread([fresh], { nextCursor: "c" })));
    await chatStore.loadThread("u2");

    api.getThread.mockResolvedValueOnce(ok(thread([old])));
    await chatStore.loadOlder("u2");
    expect(chatStore.thread("u2").messages).toHaveLength(2);

    api.getThread.mockResolvedValue(ok(thread([fresh])));
    chatStore.startThreadPolling("u2", 1);
    await vi.waitFor(() => expect(api.getThread.mock.calls.length).toBeGreaterThanOrEqual(3));
    chatStore.stopThreadPolling();

    expect(
      chatStore.thread("u2").messages.map((item) => item.id),
      "старая страница обязана уцелеть",
    ).toEqual(["fresh", "old"]);
  });

  it("свежие сообщения идут первыми независимо от порядка ответа", async () => {
    const a = message({ id: "a", createdAt: "2026-07-01T10:00:00.000Z" });
    const b = message({ id: "b", createdAt: "2026-07-01T10:00:02.000Z" });
    api.getThread.mockResolvedValueOnce(ok(thread([a, b])));

    await chatStore.loadThread("u2");
    expect(chatStore.thread("u2").messages.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("очистка", () => {
  it("reset забывает переписку целиком", async () => {
    api.getDialogs.mockResolvedValue(
      ok<DialogList>({
        items: [{ peer: thread([]).peer, lastMessage: message(), unread: 2 }],
        unread: 2,
      }),
    );
    api.getThread.mockResolvedValue(ok(thread([message()])));

    await chatStore.loadDialogs();
    await chatStore.loadThread("u2");
    expect(chatStore.dialogs).toHaveLength(1);
    expect(chatStore.thread("u2").messages).toHaveLength(1);

    chatStore.reset();

    expect(chatStore.dialogs).toEqual([]);
    expect(chatStore.unread).toBe(0);
    expect(chatStore.thread("u2").messages).toEqual([]);
    expect(chatStore.search).toBe("");
  });

  it("ответ, пришедший после выхода, не наполняет стор заново", async () => {
    /*
     * Ответы в полёте не отменяются: у fetchApi нет AbortController, а на
     * бесплатном хостинге с холодным стартом запрос живёт десятки секунд.
     * Без счётчика поколений переписка вышедшего человека возвращалась на
     * экран уже после `reset()` — и доставалась следующему вошедшему.
     */
    let release: (value: unknown) => void = () => {};
    api.getDialogs.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));

    const pending = chatStore.loadDialogs();
    chatStore.reset(); // человек вышел, пока запрос летел

    release(
      ok<DialogList>({
        items: [{ peer: thread([]).peer, lastMessage: message(), unread: 5 }],
        unread: 5,
      }),
    );
    await pending;

    expect(chatStore.dialogs, "чужая переписка не должна вернуться").toEqual([]);
    expect(chatStore.unread).toBe(0);
  });
});

describe("счётчик непрочитанных", () => {
  it("обнуляется оптимистично и возвращается, если сервер отказал", async () => {
    api.getDialogs.mockResolvedValue(
      ok<DialogList>({
        items: [{ peer: thread([]).peer, lastMessage: message(), unread: 3 }],
        unread: 3,
      }),
    );
    await chatStore.loadDialogs();
    expect(chatStore.unread).toBe(3);

    api.markRead.mockResolvedValueOnce({ error: "Сеть недоступна", status: 0 });
    api.unreadCount.mockResolvedValueOnce(ok({ unread: 3 }));
    await chatStore.markRead("u2");

    // Иначе значок остался бы нулевым при непрочитанных и не вернулся бы до
    // перезагрузки страницы.
    expect(chatStore.unread).toBe(3);
  });
});
