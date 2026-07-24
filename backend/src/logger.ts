/**
 * Централизованное логирование с автоматической редакцией секретов и персональных
 * данных (SEC-003).
 *
 * Любой лог backend проходит через этот модуль, поэтому токены, пароли, подписи,
 * учётные данные в connection-строках и email не попадают в вывод — ни в свойствах
 * объектов, ни в свободном тексте (сообщения об ошибках, URL, query-параметры).
 *
 * Единственная точка, где допустим прямой вызов `console`. Остальной код backend
 * должен использовать `logger` (это дополнительно закреплено правилом `no-console`
 * в ESLint).
 */

export const REDACTED = "[REDACTED]";

/** Глубина, дальше которой объекты не раскрываются (защита от гигантских/циклических структур). */
const MAX_DEPTH = 6;

/**
 * Ключи, значение которых всегда скрывается целиком. Проверяется нормализованный
 * ключ (нижний регистр без разделителей), поэтому `API_KEY`, `api-key` и `apiKey`
 * трактуются одинаково.
 */
const SENSITIVE_KEY_SUBSTRINGS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "credential",
  "apikey",
  "signature",
  "email",
  "privatekey",
];

/** Короткие/неоднозначные ключи, для которых требуется точное совпадение (без ложных «design», «assignee»). */
const SENSITIVE_KEY_EXACT = new Set(["sign", "sig", "otp", "pin", "hash", "salt", "pwd", "auth"]);

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (SENSITIVE_KEY_EXACT.has(normalized)) return true;
  return SENSITIVE_KEY_SUBSTRINGS.some((needle) => normalized.includes(needle));
}

// --- Строковые паттерны --------------------------------------------------------

/** `Bearer <token>` в заголовках/строках. */
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Учётные данные внутри URL: `scheme://user:password@host` (postgres, redis, http basic и т.д.). */
const URL_CREDENTIALS_RE = /\b([a-z][a-z0-9+.-]*:\/\/[^:@\s/]+):[^@\s/]+@/gi;

/** `key=value` / `key: value` для чувствительных ключей в свободном тексте и query-строках. */
const SENSITIVE_PAIR_RE =
  /\b(password|passwd|pwd|token|secret|signature|sign|sig|otp|pin|authorization|auth|api[_-]?key|access[_-]?token|refresh[_-]?token)\b(\s*[=:]\s*)("?)([^&\s"',;}]+)\3/gi;

/** Email-адрес в любом месте строки (PII). */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Редакция секретов и PII в произвольной строке. */
export function redactText(input: string): string {
  return input
    .replace(URL_CREDENTIALS_RE, `$1:${REDACTED}@`)
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(SENSITIVE_PAIR_RE, `$1$2${REDACTED}`)
    .replace(EMAIL_RE, REDACTED);
}

// --- Редакция значений ---------------------------------------------------------

function redactError(error: Error, seen: WeakSet<object>, depth: number): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: error.name,
    message: redactText(error.message),
  };
  if (error.stack) base.stack = redactText(error.stack);
  // Собственные перечислимые поля (например, `code`/`detail` у ошибок PostgreSQL —
  // `detail` может содержать значения строк, поэтому тоже редактируется).
  const own = error as unknown as Record<string, unknown>;
  for (const key of Object.keys(own)) {
    base[key] = isSensitiveKey(key) ? REDACTED : redactValue(own[key], seen, depth + 1);
  }
  return base;
}

/**
 * Рекурсивно редактирует значение: строки — через {@link redactText}, объекты и массивы —
 * с сокрытием чувствительных ключей. Циклы и слишком глубокие структуры безопасно обрезаются.
 */
export function redactValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case "string":
      return redactText(value);
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return `${value}n`;
    case "symbol":
      return value.toString();
    case "function":
      return "[Function]";
  }

  if (value instanceof Error) {
    if (depth > MAX_DEPTH) return "[Error]";
    return redactError(value, seen, depth);
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    if (depth > MAX_DEPTH) return Array.isArray(value) ? "[Array]" : "[Object]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, seen, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactValue(item, seen, depth + 1);
    }
    return out;
  }

  return value;
}

// --- Публичный logger ----------------------------------------------------------

type ConsoleMethod = "log" | "warn" | "error" | "debug";

function emit(method: ConsoleMethod, args: unknown[]): void {
  const safe = args.map((arg) => redactValue(arg));
  console[method](...safe);
}

export const logger = {
  info: (...args: unknown[]): void => emit("log", args),
  warn: (...args: unknown[]): void => emit("warn", args),
  error: (...args: unknown[]): void => emit("error", args),
  debug: (...args: unknown[]): void => emit("debug", args),
};

/**
 * Stream-адаптер для morgan: строка запроса проходит ту же редакцию, что и остальной лог.
 */
export const loggerStream = {
  write: (line: string): void => logger.info(line.replace(/\n$/, "")),
};
