import assert from "node:assert/strict";
import test from "node:test";
import { eventDateToIso, isoToLegacyDate } from "./eventDate";

test("legacy Moscow date round-trips through timestamptz", () => {
  const iso = eventDateToIso("27/06/26", "18:30");
  assert.equal(iso, "2026-06-27T15:30:00.000Z");
  assert.deepEqual(isoToLegacyDate(iso), { date: "27/06/26", time: "18:30" });
});

test("invalid calendar date is rejected", () => {
  assert.throws(() => eventDateToIso("31/02/26", "12:00"), /Invalid event date/);
});

test("ISO calendar date keeps the supplied local time", () => {
  assert.equal(
    eventDateToIso("2026-07-23", "09:15"),
    "2026-07-23T06:15:00.000Z",
  );
});
