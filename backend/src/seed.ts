import type { User, Event, Comment } from "./types";

/**
 * Сид-данные. Повторяют макетные события фронтенда
 * (volleyball / karaoke / picnic из page-1), чтобы лента сразу
 * показывала осмысленный контент после подключения к API.
 */

export const seedUsers: User[] = [
  {
    id: "u1",
    name: "Эльмира Гильманова",
    email: "elmira@povod.app",
    avatar: "https://i.pravatar.cc/150?img=47",
    interests: ["IT", "Музыка", "Путешествия"],
    friends: ["u2", "u3"],
    createdAt: "2026-05-01T10:00:00.000Z",
  },
  {
    id: "u2",
    name: "Сергей Садчиков",
    email: "sergey@povod.app",
    avatar: "https://i.pravatar.cc/150?img=12",
    interests: ["Спорт", "Технологии"],
    friends: ["u1"],
    createdAt: "2026-05-01T10:05:00.000Z",
  },
  {
    id: "u3",
    name: "Аня Котова",
    email: "anya@povod.app",
    avatar: "https://i.pravatar.cc/150?img=32",
    interests: ["Искусство", "Еда", "Кино"],
    friends: ["u1"],
    createdAt: "2026-05-02T09:00:00.000Z",
  },
];

export const seedEvents: Event[] = [
  {
    id: "1",
    title: "Пляжный волейбол",
    description:
      "Собираемся поиграть в волейбол на песке. Уровень любой, главное — настроение и хорошая компания!",
    date: "27/06/26",
    time: "18:00",
    location: "Круглотский сад",
    category: "Спорт",
    author: "Эльмира Гильманова",
    authorId: "u1",
    participants: 6,
    participantIds: ["u1", "u2"],
    image: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800&q=80",
    tags: ["Спорт", "На воздухе"],
    coords: [55.7558, 37.6173],
    format: "public",
    createdAt: "2026-06-01T12:00:00.000Z",
  },
  {
    id: "2",
    title: "Вечернее караоке",
    description: "Поём любимые хиты до утра. Бронируем зал на 10 человек, приходи со своим плейлистом.",
    date: "28/06/26",
    time: "22:00",
    location: "Караоке-клуб «Голос»",
    category: "Музыка",
    author: "Сергей Садчиков",
    authorId: "u2",
    participants: 4,
    participantIds: ["u2"],
    image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800&q=80",
    tags: ["Музыка", "Вечер"],
    coords: [55.7517, 37.6178],
    format: "public",
    createdAt: "2026-06-02T15:30:00.000Z",
  },
  {
    id: "3",
    title: "Пикник в лесу",
    description: "Берём пледы, еду и настолки. Уезжаем за город на весь день — отдыхаем от городской суеты.",
    date: "30/06/26",
    time: "12:00",
    location: "Лес за городом",
    category: "Отдых",
    author: "Аня Котова",
    authorId: "u3",
    participants: 8,
    participantIds: ["u3", "u1"],
    image: "https://images.unsplash.com/photo-1526401485004-46910ecc8e51?w=800&q=80",
    tags: ["Отдых", "Еда"],
    coords: [55.8, 37.5],
    format: "public",
    createdAt: "2026-06-03T08:00:00.000Z",
  },
];

export const seedComments: Comment[] = [
  {
    id: "c1",
    text: "Я в деле! Принесу мяч.",
    author: seedUsers[1],
    eventId: "1",
    createdAt: "2026-06-04T10:00:00.000Z",
  },
  {
    id: "c2",
    text: "А парковка рядом есть?",
    author: seedUsers[2],
    eventId: "1",
    createdAt: "2026-06-04T11:30:00.000Z",
  },
];
