import { describe, expect, it } from "vitest";
import {
  chatTimeShort,
  dayLabel,
  formatNotification,
  relativeTime,
  timeShort,
} from "./notificationText";
import type { Notification } from "../../services/api";

const base: Notification = {
  id: "n1",
  userId: "u1",
  type: "event_joined",
  eventId: "1",
  eventTitle: "Пляжный волейбол",
  actorId: "u2",
  actorName: "Марк",
  createdAt: "2026-07-01T10:00:00.000Z",
};

describe("текст уведомления", () => {
  it("описывает каждый тип события", () => {
    expect(formatNotification(base)).toBe("Марк записался на ваше событие «Пляжный волейбол»");
    expect(formatNotification({ ...base, type: "event_comment" })).toBe(
      "Марк оставил комментарий к вашему событию «Пляжный волейбол»",
    );
    expect(formatNotification({ ...base, type: "event_cancelled" })).toBe(
      "Событие «Пляжный волейбол» отменено",
    );
  });

  it("перечисляет изменения без запятой перед последним", () => {
    const updated = { ...base, type: "event_updated" as const };
    expect(formatNotification({ ...updated, changes: ["время"] })).toContain("изменились время");
    expect(formatNotification({ ...updated, changes: ["время", "место"] })).toContain(
      "изменились время и место",
    );
    expect(formatNotification({ ...updated, changes: ["время", "место", "название"] })).toContain(
      "изменились время, место и название",
    );
  });

  it("не показывает пустоту, если имени участника нет", () => {
    // Автора действия могли удалить: `actor_id` обнуляется, имя остаётся, но
    // на старых записях его может не быть вовсе.
    expect(formatNotification({ ...base, actorName: undefined })).toBe(
      "Кто-то записался на ваше событие «Пляжный волейбол»",
    );
    expect(formatNotification({ ...base, actorName: "   " })).toContain("Кто-то");
  });

  it("не падает на уведомлении об изменении без списка изменений", () => {
    expect(formatNotification({ ...base, type: "event_updated", changes: undefined })).toBe(
      "В событии «Пляжный волейбол» изменились детали",
    );
  });

  it("у личного сообщения нет события и оно не притворяется, что есть", () => {
    // Единственный тип без eventTitle: раньше здесь появилось бы «undefined»
    // в кавычках, потому что заголовок подставлялся безусловно.
    const message: Notification = {
      ...base,
      type: "direct_message",
      eventId: undefined,
      eventTitle: undefined,
    };
    expect(formatNotification(message)).toBe("Марк написал вам");
  });

  it("описывает оба типа уведомлений о дружбе", () => {
    const base_ = { ...base, eventId: undefined, eventTitle: undefined };
    expect(formatNotification({ ...base_, type: "friend_request" })).toBe(
      "Марк хочет добавить вас в друзья",
    );
    expect(formatNotification({ ...base_, type: "friend_accepted" })).toBe(
      "Марк принял вашу заявку в друзья",
    );
  });

  it("подставляет заглушку, если название события потерялось", () => {
    expect(formatNotification({ ...base, eventTitle: undefined })).toBe(
      "Марк записался на ваше событие «без названия»",
    );
  });
});

describe("относительное время", () => {
  const now = Date.parse("2026-07-10T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("склоняет числительные по-русски", () => {
    expect(relativeTime(ago(30_000), now)).toBe("только что");
    expect(relativeTime(ago(60_000), now)).toBe("1 минуту назад");
    expect(relativeTime(ago(3 * 60_000), now)).toBe("3 минуты назад");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 минут назад");
    // 11–14 — исключение: «11 минут», а не «11 минута».
    expect(relativeTime(ago(11 * 60_000), now)).toBe("11 минут назад");
    expect(relativeTime(ago(21 * 60_000), now)).toBe("21 минуту назад");
    expect(relativeTime(ago(2 * 3_600_000), now)).toBe("2 часа назад");
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2 дня назад");
  });

  it("после недели переходит на дату: «14 дней назад» всё равно считают в уме", () => {
    expect(relativeTime(ago(8 * 86_400_000), now)).toBe("2 июля");
  });

  it("не ломается на некорректной дате", () => {
    expect(relativeTime("не дата", now)).toBe("");
  });
});

/*
 * Времена чата строятся из ЛОКАЛЬНЫХ компонент даты, а не из ISO-строк с `Z`:
 * помощники сравнивают календарные дни в местном времени, и тест обязан давать
 * один результат и в CI (UTC), и на машине разработчика (UTC+3).
 */
const at = (year: number, month: number, day: number, hours = 12, minutes = 0): string =>
  new Date(year, month, day, hours, minutes).toISOString();

// «Сейчас» — 3 августа 2026, 15:00 по местному времени.
const CHAT_NOW = new Date(2026, 7, 3, 15, 0).getTime();

describe("точное время сообщения", () => {
  it("даёт часы и минуты с ведущим нулём", () => {
    expect(timeShort(at(2026, 7, 3, 14, 23))).toBe("14:23");
    expect(timeShort(at(2026, 7, 3, 9, 5))).toBe("09:05");
  });

  it("не падает на мусоре", () => {
    expect(timeShort("не дата")).toBe("");
  });
});

describe("короткое время в списке переписок", () => {
  it("сегодня — просто время", () => {
    expect(chatTimeShort(at(2026, 7, 3, 14, 23), CHAT_NOW)).toBe("14:23");
  });

  it("вчера — словом, даже если прошло меньше суток", () => {
    // 23:50 вчера — по разнице «час назад», но календарно уже другой день.
    expect(chatTimeShort(at(2026, 7, 2, 23, 50), CHAT_NOW)).toBe("Вчера");
  });

  it("до недели — день недели", () => {
    const label = chatTimeShort(at(2026, 7, 1, 10, 0), CHAT_NOW);
    // Точная аббревиатура зависит от ICU («сб» или «сб.») — проверяем форму.
    expect(label.toLowerCase()).toMatch(/^[а-яё]{2}\.?$/);
  });

  it("старше недели — дата", () => {
    const label = chatTimeShort(at(2026, 6, 20, 10, 0), CHAT_NOW);
    expect(label).toMatch(/20/);
    expect(label).toMatch(/июл/);
  });

  it("не падает на мусоре", () => {
    expect(chatTimeShort("не дата", CHAT_NOW)).toBe("");
  });
});

describe("заголовок дня в переписке", () => {
  it("сегодня и вчера — словами, по календарю, а не по разнице часов", () => {
    expect(dayLabel(at(2026, 7, 3, 0, 1), CHAT_NOW)).toBe("Сегодня");
    expect(dayLabel(at(2026, 7, 2, 23, 59), CHAT_NOW)).toBe("Вчера");
  });

  it("в этом году — дата без года", () => {
    const label = dayLabel(at(2026, 6, 27), CHAT_NOW);
    expect(label).toMatch(/27/);
    expect(label).toMatch(/июля/);
    expect(label).not.toMatch(/2026/);
  });

  it("в прошлом году — дата с годом", () => {
    expect(dayLabel(at(2025, 11, 31), CHAT_NOW)).toMatch(/2025/);
  });

  it("не падает на мусоре", () => {
    expect(dayLabel("не дата", CHAT_NOW)).toBe("");
  });
});
