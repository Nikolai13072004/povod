import { describe, expect, it } from "vitest";
import {
  ACCEPTED_IMAGE_TYPES,
  AVATAR_RESIZE,
  COVER_RESIZE,
  describeUnsupportedImage,
} from "./imageResize";

const file = (type: string, size: number) => ({ type, size, name: "photo" }) as unknown as File;

describe("проверка выбранного файла", () => {
  it("пропускает поддерживаемые растровые форматы", () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(describeUnsupportedImage(file(type, 2_000_000))).toBeUndefined();
    }
  });

  it("отклоняет SVG и не-картинки", () => {
    // Тот же список, что на сервере: SVG исключён — он может нести скрипты.
    expect(describeUnsupportedImage(file("image/svg+xml", 1000))).toBeDefined();
    expect(describeUnsupportedImage(file("application/pdf", 1000))).toBeDefined();
  });

  it("отклоняет файл, который незачем даже читать", () => {
    // До уменьшения файл целиком попадает в память вкладки.
    expect(describeUnsupportedImage(file("image/jpeg", 30 * 1024 * 1024))).toBeDefined();
  });

  it("пропускает снимок с телефона, который раньше отвергал сервер", () => {
    // 8 МБ в base64 — это ~11 МБ, лимит сервера 5 МБ. Раньше такой файл
    // отклонялся, теперь доходит до уменьшения и укладывается.
    expect(describeUnsupportedImage(file("image/jpeg", 8 * 1024 * 1024))).toBeUndefined();
  });
});

describe("параметры уменьшения", () => {
  it("аватарка квадратная и мелкая", () => {
    // Она едет в каждом ответе, где встречается владелец: в списке комментариев,
    // в списке участников. 256×256 при качестве 0.85 — это ~20 КБ.
    expect(AVATAR_RESIZE.square).toBe(true);
    expect(AVATAR_RESIZE.maxSize).toBeLessThanOrEqual(256);
  });

  it("обложка крупнее аватарки, но не оригинал", () => {
    expect(COVER_RESIZE.maxSize).toBeGreaterThan(AVATAR_RESIZE.maxSize);
    expect(COVER_RESIZE.maxSize).toBeLessThanOrEqual(1600);
    expect(COVER_RESIZE.square).toBeUndefined();
  });
});
