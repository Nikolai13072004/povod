import { z } from "zod";
import { validateImageReference } from "./media.js";

/** Схемы валидации входных данных (Zod). */

/** Изображение: внешний http(s) URL или data URL с реальной проверкой типа и размера (SEC-005). */
const imageSchema = z.string().superRefine((value, ctx) => {
  const result = validateImageReference(value);
  if (!result.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.reason });
  }
});

const eventFieldsSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  description: z.string().optional().default(""),
  startsAt: z
    .string()
    .datetime({ offset: true, message: "startsAt должен быть ISO 8601 timestamp" }),
  timezone: z
    .string()
    .min(1)
    .default("Europe/Moscow")
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, "Некорректная IANA timezone"),
  location: z.string().optional().default(""),
  category: z.string().optional(),
  image: imageSchema.optional(),
  tags: z.array(z.string()).optional(),
  coords: z.tuple([z.number(), z.number()]).optional(),
  format: z.enum(["public", "private"]).optional(),
  /** Окончание события. Не задано — событие «до упора» (BE-006). */
  endsAt: z
    .string()
    .datetime({ offset: true, message: "endsAt должен быть ISO 8601 timestamp" })
    .optional(),
  /**
   * Предел числа участников вместе с автором (BE-007). Минимум 1: автор
   * становится первым участником, поэтому с нулём событие нельзя было бы
   * создать даже ему самому. Верхняя граница отсекает опечатки вроде лишних
   * нулей — событий на миллион человек в приложении для встреч не бывает.
   */
  participantLimit: z.number().int().min(1).max(100_000).optional(),
});

/** Событие не может закончиться раньше, чем началось: это опечатка, а не данные. */
const endsAfterStarts = (value: { startsAt?: string; endsAt?: string }) =>
  !value.startsAt || !value.endsAt || Date.parse(value.endsAt) > Date.parse(value.startsAt);

export const eventCreateSchema = eventFieldsSchema.refine(endsAfterStarts, {
  path: ["endsAt"],
  message: "Окончание должно быть позже начала",
});

/**
 * При правке проверка пары применима, только когда переданы оба поля: перенос
 * одного начала сверяется с сохранённым окончанием уже в маршруте, где виден
 * текущий вид события.
 */
export const eventUpdateSchema = eventFieldsSchema.partial().refine(endsAfterStarts, {
  path: ["endsAt"],
  message: "Окончание должно быть позже начала",
});

/** Параметры выдаваемого приглашения (BE-008); без них — срок по умолчанию. */
export const invitationCreateSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
});

/** Запрос ссылки восстановления (SEC-008). */
export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email("Некорректный email"),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, "Токен обязателен"),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов").max(200),
});

export const commentCreateSchema = z.object({
  text: z.string().min(1, "Текст комментария обязателен"),
  eventId: z.string().min(1, "eventId обязателен"),
});

/** Обновление собственного профиля: все поля необязательны (BE-010). */
export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2, "Имя слишком короткое").max(100),
    city: z.string().trim().max(100).or(z.literal("")),
    avatar: imageSchema.or(z.literal("")),
    interests: z.array(z.string().trim().min(1).max(50)).max(30, "Слишком много интересов"),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Нужно передать хотя бы одно поле",
  });

/**
 * Пометка уведомлений прочитанными. Без `ids` читается всё — это нажатие
 * «Прочитать все»; со списком — отдельные записи при открытии ленты.
 */
export const markNotificationsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200).optional(),
});

export const friendAddSchema = z.object({
  friendId: z.string().min(1, "friendId обязателен"),
});

const emailSchema = z
  .string()
  .trim()
  .email("Некорректный email")
  .max(254)
  .transform((value) => value.toLocaleLowerCase("en"));

const passwordSchema = z
  .string()
  .min(8, "Пароль должен содержать минимум 8 символов")
  .max(128, "Пароль слишком длинный");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Имя слишком короткое").max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Введите пароль").max(128),
});
