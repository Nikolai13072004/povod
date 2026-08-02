import type { User, Event, Comment } from "./types.js";

/**
 * Сид-данные. Повторяют макетные события фронтенда
 * (volleyball / karaoke / picnic из page-1), чтобы лента сразу
 * показывала осмысленный контент после подключения к API.
 *
 * Даты событий вычисляются относительно момента запуска сервера, а не жёстко
 * зашиты: иначе демо-лента протухает — фиксированные «27 июня 2026» через
 * месяц уже в прошлом, и портфолио выглядит заброшенным. `new Date()` здесь
 * берётся один раз при загрузке модуля, то есть при старте процесса.
 */
const seedBase = new Date();

/** ISO-момент «через `days` дней в `hour:00`» от старта сервера. */
function inDays(days: number, hour: number): string {
  const date = new Date(seedBase);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/** ISO-момент «`days` дней назад» — для отметок создания. */
function daysAgo(days: number): string {
  const date = new Date(seedBase);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

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
    startsAt: inDays(3, 15),
    timezone: "Europe/Moscow",
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
    createdAt: daysAgo(4),
  },
  {
    id: "2",
    title: "Вечернее караоке",
    description:
      "Поём любимые хиты до утра. Бронируем зал на 10 человек, приходи со своим плейлистом.",
    startsAt: inDays(5, 19),
    timezone: "Europe/Moscow",
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
    createdAt: daysAgo(3),
  },
  {
    id: "3",
    title: "Пикник в лесу",
    description:
      "Берём пледы, еду и настолки. Уезжаем за город на весь день — отдыхаем от городской суеты.",
    startsAt: inDays(7, 9),
    timezone: "Europe/Moscow",
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
    createdAt: daysAgo(3),
  },
  {
    id: "4",
    title: "Утренняя пробежка в парке",
    description: "Лёгкая пробежка на 5 км и растяжка. Темп щадящий, останавливаемся на кофе после.",
    startsAt: inDays(2, 8),
    timezone: "Europe/Moscow",
    location: "Парк Горького",
    category: "Спорт",
    author: "Сергей Садчиков",
    authorId: "u2",
    participants: 3,
    participantIds: ["u2"],
    image: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=80",
    tags: ["Спорт", "Утро"],
    coords: [55.7304, 37.6017],
    format: "public",
    createdAt: daysAgo(2),
  },
  {
    id: "5",
    title: "Кинопоказ под открытым небом",
    description: "Смотрим классику на большом экране, берём пледы и попкорн. Начало после заката.",
    startsAt: inDays(9, 21),
    timezone: "Europe/Moscow",
    location: "Крыша на Покровке",
    category: "Кино",
    author: "Аня Котова",
    authorId: "u3",
    participants: 12,
    participantIds: ["u3"],
    image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80",
    tags: ["Кино", "Вечер"],
    coords: [55.7602, 37.6452],
    format: "public",
    createdAt: daysAgo(2),
  },
  {
    id: "6",
    title: "Настолки и чай",
    description:
      "Вечер настольных игр для своих: «Каркассон», «Кодовые имена», что принесёте. Новичкам рады.",
    startsAt: inDays(4, 18),
    timezone: "Europe/Moscow",
    location: "Антикафе «Циферблат»",
    category: "Отдых",
    author: "Эльмира Гильманова",
    authorId: "u1",
    participants: 5,
    participantIds: ["u1"],
    image: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=800&q=80",
    tags: ["Отдых", "Игры"],
    coords: [55.7659, 37.6386],
    format: "public",
    createdAt: daysAgo(1),
  },
  {
    id: "7",
    title: "Фотопрогулка по центру",
    description:
      "Гуляем и снимаем городские виды. Подойдёт и телефон, и зеркалка — делимся кадрами после.",
    startsAt: inDays(12, 12),
    timezone: "Europe/Moscow",
    location: "Патриаршие пруды",
    category: "Искусство",
    author: "Аня Котова",
    authorId: "u3",
    participants: 7,
    participantIds: ["u3", "u2"],
    image: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80",
    tags: ["Искусство", "На воздухе"],
    coords: [55.7636, 37.5923],
    format: "public",
    createdAt: daysAgo(1),
  },
  {
    id: "8",
    title: "IT-митап: про пет-проекты",
    description:
      "Три коротких доклада о том, как доводят пет-проекты до релиза, и нетворкинг с пиццей.",
    startsAt: inDays(15, 19),
    timezone: "Europe/Moscow",
    location: "Коворкинг «Ключ»",
    category: "IT",
    author: "Эльмира Гильманова",
    authorId: "u1",
    participants: 20,
    participantIds: ["u1", "u3"],
    image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
    tags: ["IT", "Нетворкинг"],
    coords: [55.7423, 37.6156],
    format: "public",
    createdAt: daysAgo(1),
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
