import { z } from "zod";

const booleanValue = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

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
    DEMO_AUTH_ENABLED: booleanValue.optional(),
    DEMO_AUTH_PASSWORD: z.string().min(8).default("povod-demo"),
    ENABLE_EXTERNAL_EVENTS: booleanValue.default("true"),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;
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
  });

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
    demoAuthEnabled:
      values.DEMO_AUTH_ENABLED ?? values.NODE_ENV !== "production",
    demoAuthPassword: values.DEMO_AUTH_PASSWORD,
    externalEvents: values.ENABLE_EXTERNAL_EVENTS,
  };
}

export const config = loadConfig();
