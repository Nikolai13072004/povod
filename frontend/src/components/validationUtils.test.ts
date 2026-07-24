import { describe, expect, it } from "vitest";
import { validateDate, validateLocation, validateTime } from "./validationUtils";

describe("validateDate", () => {
  it("accepts valid calendar dates", () => {
    expect(validateDate("26.06.2026")).toBe(true);
    expect(validateDate("1.1.2026")).toBe(true);
    expect(validateDate("29.02.2024")).toBe(true); // високосный год
  });

  it("rejects impossible dates", () => {
    expect(validateDate("31.02.2026")).toBe(false);
    expect(validateDate("29.02.2026")).toBe(false); // не високосный
    expect(validateDate("00.06.2026")).toBe(false);
    expect(validateDate("15.13.2026")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(validateDate("")).toBe(false);
    expect(validateDate("26/06")).toBe(false);
    expect(validateDate("2026-06-26")).toBe(false);
    expect(validateDate("abc")).toBe(false);
  });
});

describe("validateTime", () => {
  it("accepts valid 24h times", () => {
    expect(validateTime("00:00")).toBe(true);
    expect(validateTime("9:30")).toBe(true);
    expect(validateTime("23:59")).toBe(true);
  });

  it("rejects out-of-range or malformed times", () => {
    expect(validateTime("24:00")).toBe(false);
    expect(validateTime("12:60")).toBe(false);
    expect(validateTime("12")).toBe(false);
    expect(validateTime("")).toBe(false);
  });
});

describe("validateLocation", () => {
  it("accepts letters, spaces and hyphens (2–50 chars)", () => {
    expect(validateLocation("Москва")).toBe(true);
    expect(validateLocation("Нижний Новгород")).toBe(true);
    expect(validateLocation("Saint-Petersburg")).toBe(true);
  });

  it("rejects too short, digits or symbols", () => {
    expect(validateLocation("A")).toBe(false);
    expect(validateLocation("Улица 5")).toBe(false);
    expect(validateLocation("город!")).toBe(false);
    expect(validateLocation("   ")).toBe(false);
  });
});
