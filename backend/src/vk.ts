import crypto from "node:crypto";

/**
 * Проверка подписи launch-параметров VK Mini Apps.
 *
 * Алгоритm (официальный):
 *   1. Берём только параметры с префиксом `vk_`.
 *   2. Сортируем по ключу.
 *   3. Склеиваем в query-строку `key=encodeURIComponent(value)&...`.
 *   4. HMAC-SHA256(checkString, secret) в base64url.
 *   5. Сравниваем с параметром `sign`.
 *
 * @param search строка query (с ведущим "?" или без)
 * @param secret защищённый ключ приложения VK
 */
export function verifyVkLaunch(search: string, secret: string): boolean {
  if (!secret) return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const sign = params.get("sign");
  if (!sign) return false;

  const keys: string[] = [];
  params.forEach((_value, key) => {
    if (key.startsWith("vk_")) keys.push(key);
  });
  keys.sort();

  const checkString = keys
    .map((k) => `${k}=${encodeURIComponent(params.get(k) ?? "")}`)
    .join("&");

  const hash = crypto.createHmac("sha256", secret).update(checkString).digest("base64url");

  // Сравнение в постоянное время, чтобы не утекало по таймингу
  const a = Buffer.from(hash);
  const b = Buffer.from(sign);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Достаёт vk_user_id из launch-параметров. */
export function getVkUserId(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("vk_user_id");
}
