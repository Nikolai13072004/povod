/**
 * Серверная проверка изображений событий (SEC-005).
 *
 * Изображение приходит в поле `image` как строка одного из двух видов:
 *   1. внешний URL (`https://…`) — принимается только http/https и разумная длина;
 *   2. data URL (`data:<mime>;base64,<payload>`) — фактический тип определяется по
 *      сигнатуре (magic bytes), а НЕ по заявленному в data URL MIME, и размер
 *      декодированных данных ограничен.
 *
 * Так клиент не может протащить исполняемый/неподдерживаемый контент, подменив
 * client-side MIME (например, выдать SVG или произвольные байты за `image/png`).
 */

/** Разрешённые растровые форматы. SVG исключён намеренно (может содержать скрипты). */
export const ALLOWED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

/** Максимальный размер декодированного изображения — 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Максимальная длина строки внешнего URL. */
export const MAX_IMAGE_URL_LENGTH = 2048;

export type ImageValidation = { ok: true } | { ok: false; reason: string };

/** Определяет фактический тип изображения по сигнатуре первых байтов. */
export function detectImageMime(bytes: Uint8Array): AllowedImageMime | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: "GIF87a" / "GIF89a"
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

const DATA_URL_RE = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)?(;base64)?,(.*)$/is;

function validateDataUrl(value: string): ImageValidation {
  const match = DATA_URL_RE.exec(value);
  if (!match) return { ok: false, reason: "Некорректный data URL изображения" };
  const [, , base64Marker, payload] = match;
  if (!base64Marker) {
    return { ok: false, reason: "Изображение должно быть закодировано в base64" };
  }

  let bytes: Buffer;
  try {
    // base64 в Node декодируется «толерантно», поэтому дополнительно сверяем длину.
    bytes = Buffer.from(payload, "base64");
  } catch {
    return { ok: false, reason: "Не удалось декодировать изображение" };
  }
  if (bytes.length === 0) return { ok: false, reason: "Пустое изображение" };
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "Изображение больше 5 MB" };
  }

  const detected = detectImageMime(bytes);
  if (!detected) {
    return {
      ok: false,
      reason: `Неподдерживаемый тип изображения. Разрешены: ${ALLOWED_IMAGE_MIMES.join(", ")}`,
    };
  }
  return { ok: true };
}

/** Проверяет ссылку/данные изображения. Пустая строка считается «нет изображения». */
export function validateImageReference(value: string): ImageValidation {
  if (value === "") return { ok: true };

  if (value.startsWith("data:")) return validateDataUrl(value);

  if (/^https?:\/\//i.test(value)) {
    if (value.length > MAX_IMAGE_URL_LENGTH) {
      return { ok: false, reason: "Слишком длинный URL изображения" };
    }
    try {
      new URL(value);
      return { ok: true };
    } catch {
      return { ok: false, reason: "Некорректный URL изображения" };
    }
  }

  return { ok: false, reason: "Изображение должно быть http(s) URL или data URL" };
}
