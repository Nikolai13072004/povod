import { describe, expect, it } from "vitest";
import { formatNotification, relativeTime } from "./notificationText";
import type { Notification } from "../../services/api";

const base: Notification = {
  id: "n1",
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
