import { expect, test, type Page } from "@playwright/test";
import { reachFeed, register, uniqueEmail } from "./helpers";

/**
 * Личные сообщения на настоящем стеке (PROD-011).
 *
 * Модульные тесты подменяют сеть моками и потому не заметят расхождения фронта
 * с бэкендом — а здесь оно как раз вероятно: право писать проверяется на
 * сервере, а интерфейс обязан о том же правиле знать заранее.
 *
 * Сценарий проходит весь путь целиком, включая дружбу: до этой задачи отправить
 * заявку через интерфейс было негде вовсе, и чат оказался бы недостижим.
 */

/** Тот же адрес, что в `webServer` конфигурации Playwright. */
const BACKEND_URL = "http://127.0.0.1:8081";

/** Отправляет заявку в друзья с чужого профиля. */
async function requestFriendship(page: Page, peerId: string): Promise<void> {
  await page.goto(`/users/${peerId}`);
  await page.getByRole("button", { name: "Добавить в друзья" }).click();
  await expect(page.getByRole("button", { name: "Отменить заявку" })).toBeVisible();
}

/**
 * Идентификатор текущего пользователя.
 *
 * Спрашивается у API: в интерфейсе он нигде не показан, а адреса профилей и
 * переписок строятся именно из него. `page.request` делит куки с вкладкой,
 * поэтому сессия та же самая.
 */
async function currentUserId(page: Page): Promise<string> {
  const response = await page.request.get(`${BACKEND_URL}/api/Auth/session`);
  expect(response.ok(), "сессия должна быть активной").toBe(true);
  const body = (await response.json()) as { user?: { id?: string } };
  const id = body.user?.id ?? "";
  expect(id, "не удалось узнать идентификатор пользователя").not.toBe("");
  return id;
}

test("друзья переписываются, а посторонний не может написать", async ({ page, context }) => {
  // Первый.
  await register(page, "Алиса", uniqueEmail("alice"));
  await reachFeed(page);
  const aliceId = await currentUserId(page);

  // Второй — в отдельном контексте, со своими куками.
  const borisPage = await context.browser()!.newPage();
  await register(borisPage, "Борис", uniqueEmail("boris"));
  await reachFeed(borisPage);
  const borisId = await currentUserId(borisPage);

  // Пока не друзья — переписки нет и завести её нельзя.
  await borisPage.goto(`/chats/${aliceId}`);
  await expect(borisPage.getByText("Переписка недоступна")).toBeVisible();

  // Заявка и согласие.
  await requestFriendship(borisPage, aliceId);
  await page.goto(`/users/${borisId}`);
  await page.getByRole("button", { name: "Принять заявку" }).click();
  await expect(page.getByRole("button", { name: "Написать" })).toBeVisible();

  // Теперь можно писать.
  await page.getByRole("button", { name: "Написать" }).click();
  await page.getByLabel("Текст сообщения").fill("привет, это Алиса");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("привет, это Алиса")).toBeVisible();

  // Собеседник видит сообщение и отвечает.
  await borisPage.goto("/chats");
  await expect(borisPage.getByRole("button", { name: "Переписка с Алиса" })).toBeVisible();
  await borisPage.getByRole("button", { name: "Переписка с Алиса" }).click();
  await expect(borisPage.getByText("привет, это Алиса")).toBeVisible();
  await borisPage.getByLabel("Текст сообщения").fill("привет, это Борис");
  await borisPage.getByRole("button", { name: "Отправить" }).click();
  await expect(borisPage.getByText("привет, это Борис")).toBeVisible();
  await borisPage.close();

  // Третий знает идентификатор — и всё равно не видит ни переписки, ни того,
  // что она существует.
  const strangerPage = await context.browser()!.newPage();
  await register(strangerPage, "Посторонний", uniqueEmail("stranger"));
  await reachFeed(strangerPage);
  await strangerPage.goto(`/chats/${aliceId}`);
  await expect(strangerPage.getByText("Переписка недоступна")).toBeVisible();
  await strangerPage.close();
});

test("своё сообщение правится с отметкой и удаляется", async ({ page, context }) => {
  await register(page, "Автор", uniqueEmail("author"));
  await reachFeed(page);
  const authorId = await currentUserId(page);

  const peerPage = await context.browser()!.newPage();
  await register(peerPage, "Собеседник", uniqueEmail("peer"));
  await reachFeed(peerPage);
  const peerId = await currentUserId(peerPage);

  await requestFriendship(peerPage, authorId);
  await page.goto(`/users/${peerId}`);
  await page.getByRole("button", { name: "Принять заявку" }).click();
  await page.getByRole("button", { name: "Написать" }).click();

  await page.getByLabel("Текст сообщения").fill("опечятка");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("опечятка")).toBeVisible();

  await page.getByRole("button", { name: "Изменить" }).click();
  await page.getByLabel("Изменить сообщение").fill("опечатка");
  await page.getByRole("button", { name: "Сохранить" }).click();

  await expect(page.getByText("опечатка")).toBeVisible();
  // Собеседник обязан видеть, что реплику меняли после отправки.
  await expect(page.getByText("изменён")).toBeVisible();

  await page.getByRole("button", { name: "Удалить" }).click();
  // Проверяем именно пузырь: строка поиска и поле ввода тоже содержат текст.
  await expect(page.getByText("Сообщений пока нет")).toBeVisible();
  await peerPage.close();
});
