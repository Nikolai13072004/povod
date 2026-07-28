import { describe, expect, it } from "vitest";
import { INTERESTS, matchesAnyInterest, normalizeInterest } from "./interests";
import { INTEREST_CATALOG } from "../stores/filtersStore";

describe("каталог интересов", () => {
  it("един для фильтра и формы создания", () => {
    // Списки были скопированы в пяти местах и разошлись: фильтр предлагал
    // «Путешествия», форма создавала «Путешествие», и чип не находил ничего.
    expect(INTEREST_CATALOG.map((item) => item.label)).toEqual([...INTERESTS]);
  });

  it("не содержит пар, различающихся только формой слова", () => {
    const stems = INTERESTS.map((label) => normalizeInterest(label).replace(/[ыиеая]$/u, ""));
    expect(new Set(stems).size).toBe(stems.length);
  });

  it("не содержит повторов", () => {
    expect(new Set(INTERESTS.map(normalizeInterest)).size).toBe(INTERESTS.length);
  });
});

describe("matchesAnyInterest", () => {
  it("пустой выбор пропускает всё", () => {
    expect(matchesAnyInterest(["Спорт"], [])).toBe(true);
  });

  it("сверяет и категорию, и теги", () => {
    // Форма создания кладёт вторую и последующие выбранные категории в теги,
    // поэтому фильтр обязан смотреть туда же.
    expect(matchesAnyInterest(["IT", "Наука", "Образование"], ["Наука"])).toBe(true);
    expect(matchesAnyInterest(["IT"], ["Наука"])).toBe(false);
  });

  it("не зависит от регистра, пробелов и ё", () => {
    // Категория не обрезалась при вводе, поэтому «Музыка » с хвостовым пробелом
    // не совпадала с интересом «Музыка».
    expect(matchesAnyInterest(["музыка "], ["Музыка"])).toBe(true);
    expect(matchesAnyInterest(["Ёлки"], ["Елки"])).toBe(true);
  });

  it("пропускает отсутствующую категорию", () => {
    expect(matchesAnyInterest([undefined, undefined], ["Спорт"])).toBe(false);
  });
});
