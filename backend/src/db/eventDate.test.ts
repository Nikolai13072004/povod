import assert from "node:assert/strict";
import test from "node:test";
import { eventDateToIso } from "./eventDate";

test("legacy Moscow date converts to timestamptz for snapshot import", () => {
  const iso = eventDateToIso("27/06/26", "18:30");
  assert.equal(iso, "2026-06-27T15:30:00.000Z");
});

test("invalid calendar date is rejected", () => {
  assert.throws(() => eventDateToIso("31/02/26", "12:00"), /Invalid event date/);
});

test("ISO calendar date keeps the supplied local time", () => {
  assert.equal(eventDateToIso("2026-07-23", "09:15"), "2026-07-23T06:15:00.000Z");
});
