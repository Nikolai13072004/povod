import { z } from "zod";

/** Схемы валидации входных данных (Zod). */

export const eventCreateSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  description: z.string().optional().default(""),
  date: z.string().min(1, "Дата обязательна"),
  time: z.string().optional().default(""),
  location: z.string().optional().default(""),
  category: z.string().optional(),
  author: z.string().optional(),
  authorId: z.string().optional(),
  image: z.string().optional(),
  tags: z.array(z.string()).optional(),
  coords: z.tuple([z.number(), z.number()]).optional(),
  format: z.enum(["public", "private"]).optional(),
  participants: z.number().optional(),
});

export const eventUpdateSchema = eventCreateSchema.partial();

export const commentCreateSchema = z.object({
  text: z.string().min(1, "Текст комментария обязателен"),
  eventId: z.string().min(1, "eventId обязателен"),
  // фронт шлёт author как объект User; допускаем также строку или отсутствие
  author: z.union([z.string(), z.record(z.unknown())]).optional(),
});

export const friendAddSchema = z.object({
  friendId: z.string().min(1, "friendId обязателен"),
});
