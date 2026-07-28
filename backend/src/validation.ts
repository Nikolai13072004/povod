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

/*
 * Верхние границы текстовых полей.
 *
 * Их не было вовсе: единственным барьером служил `express.json({ limit: "10mb" })`,
 * выбранный под фото, а не под текст. Комментарий на 9 МБ создавался и потом
 * отдавался всем посетителям события; заголовок на 9 МБ заставлял PostgreSQL
 * пересчитывать по нему поисковый вектор.
 */
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_LOCATION = 300;
const MAX_CATEGORY = 50;
const MAX_TAG = 50;
const MAX_TAGS = 20;
export const MAX_COMMENT_TEXT = 2000;

const eventFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Название обязательно")
    .max(MAX_TITLE, `Название длиннее ${MAX_TITLE} символов`),
  description: z
    .string()
    .max(MAX_DESCRIPTION, `Описание длиннее ${MAX_DESCRIPTION} символов`)
    .optional()
    .default(""),
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
  location: z
    .string()
    .max(MAX_LOCATION, `Место длиннее ${MAX_LOCATION} символов`)
    .optional()
    .default(""),
  // trim здесь не косметика: категория участвует в сортировке ленты по интересам,
  // и «Музыка » с хвостовым пробелом не совпадала с интересом «Музыка».
  category: z
    .string()
    .trim()
    .max(MAX_CATEGORY, `Категория длиннее ${MAX_CATEGORY} символов`)
    .optional(),
  image: imageSchema.optional(),
  tags: z
    .array(z.string().trim().min(1, "Пустой тег").max(MAX_TAG, `Тег длиннее ${MAX_TAG} символов`))
    .max(MAX_TAGS, `Не больше ${MAX_TAGS} тегов`)
    .optional(),
  // Диапазон повторяет CHECK в схеме базы. Без него PostgreSQL отвечал 500 с
  // именем ограничения, а in-memory адаптер молча принимал невозможную точку —
  // два адаптера расходились на одном и том же запросе.
  coords: z
    .tuple([
      z.number().min(-90, "Широта вне диапазона").max(90, "Широта вне диапазона"),
      z.number().min(-180, "Долгота вне диапазона").max(180, "Долгота вне диапазона"),
    ])
    .optional(),
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

/*
 * Создание и правка комментария живут по одним правилам.
 *
 * Раньше расходились: правка требовала `.trim()` и максимум 2000, создание — нет.
 * Комментарий из одних пробелов проходил валидацию, in-memory адаптер отдавал
 * 201 и показывал пустую реплику, а PostgreSQL отвергал вставку по CHECK — 500
 * вместо 400 на одном и том же запросе.
 */
export const commentCreateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Текст комментария обязателен")
    .max(MAX_COMMENT_TEXT, `Комментарий длиннее ${MAX_COMMENT_TEXT} символов`),
  eventId: z.string().min(1, "eventId обязателен"),
});

/**
 * Тело VK-входа.
 *
 * Раньше оно читалось напрямую из `req.body` без схемы, и `profile.avatar`
 * попадал в базу в обход `imageSchema`: заявленные в SEC-005 гарантии (SVG
 * отклоняется, размер не больше 5 МБ) в этом маршруте не действовали, а имя не
 * имело ограничения длины, хотя во всех остальных маршрутах оно есть.
 */
export const vkLoginSchema = z.object({
  launchParams: z.string().default(""),
  profile: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      avatar: imageSchema.optional(),
    })
    .optional(),
});

/** Правка комментария: меняется только текст (BE-009). */
export const commentUpdateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Текст комментария обязателен")
    .max(MAX_COMMENT_TEXT, `Комментарий длиннее ${MAX_COMMENT_TEXT} символов`),
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
