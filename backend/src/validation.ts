import { z } from "zod";
import { eventDateToIso } from "./db/eventDate";

/** Схемы валидации входных данных (Zod). */

export const eventCreateSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  description: z.string().optional().default(""),
  date: z
    .string()
    .min(1, "Дата обязательна")
    .refine((value) => {
      try {
        eventDateToIso(value);
        return true;
      } catch {
        return false;
      }
    }, "Некорректная дата"),
  time: z
    .string()
    .regex(/^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/, "Некорректное время")
    .optional()
    .default(""),
  location: z.string().optional().default(""),
  category: z.string().optional(),
  image: z.string().optional(),
  tags: z.array(z.string()).optional(),
  coords: z.tuple([z.number(), z.number()]).optional(),
  format: z.enum(["public", "private"]).optional(),
});

export const eventUpdateSchema = eventCreateSchema.partial();

export const commentCreateSchema = z.object({
  text: z.string().min(1, "Текст комментария обязателен"),
  eventId: z.string().min(1, "eventId обязателен"),
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
