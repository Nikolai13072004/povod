import { z } from "zod";

const booleanValue = z.enum(["true", "false"]).transform((value) => value === "true");

/** Боевой предел регистраций с одного адреса в час. Ослаблению в production не подлежит. */
const DEFAULT_REGISTER_LIMIT = 5;

const environmentSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    HOST: z.string().trim().min(1).default("0.0.0.0"),
    CORS_ORIGIN: z
      .string()
      .trim()
      .default("*")
      .refine((value) => value === "*" || isHttpOrigin(value), {
        message: "must be '*' or an HTTP(S) origin without a path",
      }),
    PERSIST: booleanValue.default("true"),
    SERVICE_NAME: z.string().trim().min(1).default("povod-backend"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    VK_APP_SECRET: z.string().default(""),
    VK_APP_ID: z.string().trim().default(""),
    DATABASE_URL: z
      .string()
      .trim()
      .default("")
      .refine((value) => value === "" || isPostgresUrl(value), {
        message: "must be a valid postgres:// or postgresql:// URL",
      }),
    DATABASE_SSL: z.enum(["auto", "true", "false"]).default("auto"),
    AUTH_SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    // Куки браузерной сессии (SEC-001). `lax` подходит, когда фронт и API живут
    // на одном сайте (в т.ч. разные порты localhost или поддомены одного домена).
    // `none` нужен только для настоящего cross-site и требует HTTPS.
    AUTH_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    AUTH_COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
    AUTH_COOKIE_DOMAIN: z.string().trim().default(""),
    /** Адрес приложения — из него собираются ссылки в письмах (SEC-008). */
    APP_URL: z
      .string()
      .trim()
      .default("http://localhost:5173")
      .refine((value) => isHttpOrigin(value), {
        message: "must be an HTTP(S) origin without a path",
      }),
    /**
     * Транспорт писем. `console` печатает ссылку в лог — годится для разработки,
     * но в production означает, что письма никому не уходят.
     */
    MAIL_TRANSPORT: z.enum(["console", "none", "resend", "smtp", "brevo"]).default("console"),
    RESEND_API_KEY: z.string().trim().default(""),
    /*
     * Brevo — HTTP API вместо SMTP. Нужен там, где хостинг закрывает SMTP-порты
     * (Render на бесплатном тарифе блокирует 25, 465 и 587), а своего домена
     * нет: Brevo подтверждает отдельный адрес отправителя, а не домен целиком.
     */
    BREVO_API_KEY: z.string().trim().default(""),
    /*
     * SMTP личного ящика — путь для проекта без своего домена. Провайдеры вроде
     * Resend доставляют на произвольные адреса только после подтверждения
     * домена; SMTP такого ограничения не имеет.
     */
    SMTP_HOST: z.string().trim().default(""),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(465),
    /** `true` — TLS с первого байта (порт 465); `false` — STARTTLS (587). */
    SMTP_SECURE: booleanValue.default("true"),
    SMTP_USER: z.string().trim().default(""),
    SMTP_PASSWORD: z.string().default(""),
    /** Отправитель: `user@example.com` либо `Имя <user@example.com>`. */
    MAIL_FROM: z
      .string()
      .trim()
      .default("")
      .refine((value) => value === "" || isMailAddress(value), {
        message: "must be an email address, optionally as 'Name <user@example.com>'",
      }),
    /**
     * Сколько регистраций разрешено с одного адреса в час.
     *
     * Существует ради синтетических окружений: e2e поднимает пустой бэкенд и
     * заводит десяток аккаунтов подряд с 127.0.0.1 — для боевого предела это
     * неотличимо от перебора. Ослабить защиту в production нельзя, это
     * проверяется ниже; понизить — можно.
     */
    AUTH_REGISTER_LIMIT: z.coerce.number().int().min(1).max(1000).default(DEFAULT_REGISTER_LIMIT),
    DEMO_AUTH_ENABLED: booleanValue.optional(),
    DEMO_AUTH_PASSWORD: z.string().min(8).default("povod-demo"),
    ENABLE_EXTERNAL_EVENTS: booleanValue.default("true"),
  })
  .superRefine((environment, context) => {
    // Браузер молча отбрасывает `SameSite=None` без `Secure` — ловим это на старте,
    // иначе вход просто перестанет работать без единой ошибки в логах.
    if (
      environment.AUTH_COOKIE_SAMESITE === "none" &&
      resolveCookieSecure(environment.AUTH_COOKIE_SECURE, environment.NODE_ENV) === false
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_COOKIE_SECURE"],
        message: "must be true when AUTH_COOKIE_SAMESITE is 'none' (browsers drop such cookies)",
      });
    }
    // Проверяется во всех окружениях: транспорт без ключа или без отправителя
    // сломан одинаково и в разработке, и в production. Ловим на старте, а не на
    // первом забытом пароле.
    if (environment.MAIL_TRANSPORT === "resend") {
      if (!environment.RESEND_API_KEY) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RESEND_API_KEY"],
          message: "must be set when MAIL_TRANSPORT is 'resend'",
        });
      }
      if (!environment.MAIL_FROM) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["MAIL_FROM"],
          message: "must be set when MAIL_TRANSPORT is 'resend'",
        });
      }
    }
    if (environment.MAIL_TRANSPORT === "brevo") {
      for (const key of ["BREVO_API_KEY", "MAIL_FROM"] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "must be set when MAIL_TRANSPORT is 'brevo'",
          });
        }
      }
    }
    if (environment.MAIL_TRANSPORT === "smtp") {
      for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "must be set when MAIL_TRANSPORT is 'smtp'",
          });
        }
      }
      /*
       * Яндекс и Gmail требуют, чтобы отправитель совпадал с ящиком, под
       * которым выполнен вход. Несовпадение они либо отклоняют, либо молча
       * подменяют адрес — и то и другое обнаруживается уже на живых письмах.
       */
      if (
        environment.SMTP_USER &&
        environment.MAIL_FROM &&
        !environment.MAIL_FROM.toLowerCase().includes(environment.SMTP_USER.toLowerCase())
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["MAIL_FROM"],
          message: `must contain the SMTP_USER address (${environment.SMTP_USER}) — почтовые провайдеры отклоняют чужого отправителя`,
        });
      }
    }
    if (environment.NODE_ENV !== "production") return;
    if (environment.MAIL_TRANSPORT === "console") {
      // Иначе восстановление пароля «работает»: пользователь видит «письмо
      // отправлено», а ссылка уходит в лог сервера и никому не приходит.
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MAIL_TRANSPORT"],
        message:
          "must not be 'console' in production — подключите провайдера почты " +
          "или выставьте 'none', отключив восстановление пароля осознанно",
      });
    }
    if (environment.CORS_ORIGIN === "*") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "must be an explicit origin in production",
      });
    }
    if (environment.DEMO_AUTH_ENABLED === true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEMO_AUTH_ENABLED"],
        message: "must be false in production",
      });
    }
    if (environment.AUTH_REGISTER_LIMIT > DEFAULT_REGISTER_LIMIT) {
      // Настройка заведена для синтетических окружений. В production её можно
      // ужесточить, но не ослабить: иначе она превращается в способ случайно
      // открыть перебор регистраций одной переменной окружения.
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_REGISTER_LIMIT"],
        message: `must not exceed ${DEFAULT_REGISTER_LIMIT} in production`,
      });
    }
  });

/** `auto` = «включить Secure там, где точно HTTPS», то есть в production. */
function resolveCookieSecure(value: "auto" | "true" | "false", nodeEnv: string): boolean {
  if (value === "auto") return nodeEnv === "production";
  return value === "true";
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.pathname === "/" || url.pathname === "") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/** `user@example.com` либо `Имя <user@example.com>`. */
function isMailAddress(value: string): boolean {
  const angled = /^[^<>]*<([^<>\s]+)>$/.exec(value);
  const address = angled?.[1] ?? value;
  return /^[^\s@,]+@[^\s@,.]+(\.[^\s@,.]+)+$/.test(address);
}

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

export interface AppConfig {
  port: number;
  host: string;
  persist: boolean;
  corsOrigin: string;
  serviceName: string;
  nodeEnv: "development" | "test" | "production";
  vkAppSecret: string;
  vkAppId: string;
  databaseUrl: string;
  databaseSsl: "auto" | "true" | "false";
  authSessionDays: number;
  authCookieSameSite: "lax" | "strict" | "none";
  authCookieSecure: boolean;
  authCookieDomain: string;
  appUrl: string;
  mailTransport: "console" | "none" | "resend" | "smtp" | "brevo";
  resendApiKey: string;
  brevoApiKey: string;
  mailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  authRegisterLimit: number;
  demoAuthEnabled: boolean;
  demoAuthPassword: string;
  externalEvents: boolean;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const values = result.data;
  return {
    port: values.PORT,
    host: values.HOST,
    persist: values.PERSIST,
    corsOrigin: values.CORS_ORIGIN,
    serviceName: values.SERVICE_NAME,
    nodeEnv: values.NODE_ENV,
    vkAppSecret: values.VK_APP_SECRET,
    vkAppId: values.VK_APP_ID,
    databaseUrl: values.DATABASE_URL,
    databaseSsl: values.DATABASE_SSL,
    authSessionDays: values.AUTH_SESSION_DAYS,
    authCookieSameSite: values.AUTH_COOKIE_SAMESITE,
    authCookieSecure: resolveCookieSecure(values.AUTH_COOKIE_SECURE, values.NODE_ENV),
    authCookieDomain: values.AUTH_COOKIE_DOMAIN,
    appUrl: values.APP_URL,
    mailTransport: values.MAIL_TRANSPORT,
    resendApiKey: values.RESEND_API_KEY,
    brevoApiKey: values.BREVO_API_KEY,
    mailFrom: values.MAIL_FROM,
    smtpHost: values.SMTP_HOST,
    smtpPort: values.SMTP_PORT,
    smtpSecure: values.SMTP_SECURE,
    smtpUser: values.SMTP_USER,
    smtpPassword: values.SMTP_PASSWORD,
    authRegisterLimit: values.AUTH_REGISTER_LIMIT,
    demoAuthEnabled: values.DEMO_AUTH_ENABLED ?? values.NODE_ENV !== "production",
    demoAuthPassword: values.DEMO_AUTH_PASSWORD,
    externalEvents: values.ENABLE_EXTERNAL_EVENTS,
  };
}

export const config = loadConfig();
