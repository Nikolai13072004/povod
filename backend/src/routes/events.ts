import { Router } from "express";
import { db, save, newId } from "../store";
import { asyncHandler, HttpError } from "../middleware";
import { eventCreateSchema, eventUpdateSchema } from "../validation";
import { config } from "../config";
import { getExternalEvents, findExternalEvent } from "../kudago";
import type { Event } from "../types";

export const eventsRouter = Router();

/** Парсит дату события ("DD/MM/YY", "DD.MM.YYYY" или ISO) в timestamp. */
function parseEventDate(date: string, time = "00:00"): number {
  const m = date.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const [hh, mm] = (time || "00:00").split(":").map(Number);
    return new Date(year, month - 1, day, hh || 0, mm || 0).getTime();
  }
  const t = Date.parse(date);
  return Number.isNaN(t) ? 0 : t;
}

// GET /api/Events — список (+ опц. фильтры ?search= &category= &date= &author=)
eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, category, date, author } = req.query as Record<string, string>;
    const external = config.externalEvents ? await getExternalEvents() : [];
    let items = [...db.events, ...external];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
      );
    }
    if (category) items = items.filter((e) => (e.category ?? "").toLowerCase() === category.toLowerCase());
    if (date) items = items.filter((e) => e.date === date);
    if (author) items = items.filter((e) => e.authorId === author || e.author === author);
    res.json(items);
  }),
);

// GET /api/Events/active — события, которые ещё не прошли (с запасом в сутки)
eventsRouter.get(
  "/active",
  asyncHandler(async (_req, res) => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    res.json(db.events.filter((e) => parseEventDate(e.date, e.time) >= cutoff));
  }),
);

// GET /api/Events/upcoming — будущие события по возрастанию даты
eventsRouter.get(
  "/upcoming",
  asyncHandler(async (_req, res) => {
    const now = Date.now();
    const items = db.events
      .filter((e) => parseEventDate(e.date, e.time) >= now)
      .sort((a, b) => parseEventDate(a.date, a.time) - parseEventDate(b.date, b.time));
    res.json(items);
  }),
);

// GET /api/Events/author/:authorId
eventsRouter.get(
  "/author/:authorId",
  asyncHandler(async (req, res) => {
    const { authorId } = req.params;
    res.json(db.events.filter((e) => e.authorId === authorId || e.author === authorId));
  }),
);

// GET /api/Events/:id
eventsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    let ev = db.events.find((e) => e.id === req.params.id);
    if (!ev && config.externalEvents) {
      ev =
        findExternalEvent(req.params.id) ??
        (await getExternalEvents()).find((e) => e.id === req.params.id);
    }
    if (!ev) throw new HttpError(404, "Event not found");
    res.json(ev);
  }),
);

// POST /api/Events
eventsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = eventCreateSchema.parse(req.body);
    const ev: Event = {
      id: newId(),
      title: data.title,
      description: data.description ?? "",
      date: data.date,
      time: data.time ?? "",
      location: data.location ?? "",
      category: data.category,
      author: data.author ?? "Гость",
      authorId: data.authorId ?? "guest",
      participants: data.participants ?? 1,
      participantIds: data.authorId ? [data.authorId] : [],
      image: data.image,
      tags: data.tags,
      coords: data.coords,
      format: data.format ?? "public",
      createdAt: new Date().toISOString(),
    };
    db.events.unshift(ev);
    save();
    res.status(201).json(ev);
  }),
);

// PUT /api/Events/:id
eventsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const ev = db.events.find((e) => e.id === req.params.id);
    if (!ev) throw new HttpError(404, "Event not found");
    const data = eventUpdateSchema.parse(req.body);
    Object.assign(ev, data);
    save();
    res.json(ev);
  }),
);

// DELETE /api/Events/:id
eventsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const idx = db.events.findIndex((e) => e.id === req.params.id);
    if (idx === -1) throw new HttpError(404, "Event not found");
    const [removed] = db.events.splice(idx, 1);
    db.comments = db.comments.filter((c) => c.eventId !== removed.id);
    save();
    res.status(204).send();
  }),
);

// POST /api/Events/:id/join
eventsRouter.post(
  "/:id/join",
  asyncHandler(async (req, res) => {
    const ev = db.events.find((e) => e.id === req.params.id);
    if (!ev) throw new HttpError(404, "Event not found");
    const userId = (req.body?.userId as string | undefined) ?? undefined;
    if (userId) {
      if (!ev.participantIds.includes(userId)) {
        ev.participantIds.push(userId);
        ev.participants += 1;
      }
    } else {
      ev.participants += 1;
    }
    save();
    res.json(ev);
  }),
);

// POST /api/Events/:id/leave
eventsRouter.post(
  "/:id/leave",
  asyncHandler(async (req, res) => {
    const ev = db.events.find((e) => e.id === req.params.id);
    if (!ev) throw new HttpError(404, "Event not found");
    const userId = (req.body?.userId as string | undefined) ?? undefined;
    if (userId && ev.participantIds.includes(userId)) {
      ev.participantIds = ev.participantIds.filter((id) => id !== userId);
    }
    ev.participants = Math.max(0, ev.participants - 1);
    save();
    res.json(ev);
  }),
);
