import { expect, test } from "@playwright/test";
import { createEvent, login, reachFeed, register, uniqueEmail } from "./helpers";

/**
 * Основные сценарии на настоящем стеке (QA-005).
 *
 * Модульные тесты подменяют сеть моками и потому не заметят расхождения фронта
 * с бэкендом. Здесь браузер ходит по HTTP, поэтому такие расхождения видны.
 */

test("гость не попадает в ленту без входа", async ({ page }) => {
  await page.goto("/page-1");
  // Защищённый маршрут возвращает на экран входа, а не показывает пустую ленту.
  await expect(page.getByRole("button", { name: "Войти в POVOD" })).toBeVisible();
});

test("вход демо-пользователя открывает ленту с событиями", async ({ page }) => {
  await login(page, "elmira@povod.app", "povod-demo");
  await reachFeed(page);

  // Лента отдаётся страницами: проверяем, что конверт разобран и события видны.
  await expect(page.getByText("Пляжный волейбол")).toBeVisible();
});

test("неверный пароль не пускает и объясняет причину", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill("elmira@povod.app");
  await page.getByPlaceholder("Пароль").fill("wrong-password");
  await page.getByRole("button", { name: "Войти в POVOD" }).click();

  await expect(page.getByText(/Invalid email or password|Не удалось войти/)).toBeVisible();
  await expect(page).not.toHaveURL(/page-1/);
});

test("забытый пароль не подтверждает, зарегистрирован ли адрес", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Забыли пароль?" }).click();

  await page.getByPlaceholder("Email").fill("nobody-here@povod.test");
  await page.getByRole("button", { name: "Прислать ссылку" }).click();

  // Ответ одинаков и для чужого адреса: иначе форма превращается в проверялку
  // «кто зарегистрирован» (SEC-008).
  await expect(page.getByText(/Если такой адрес зарегистрирован/)).toBeVisible();
});

test("ссылка восстановления с негодным токеном честно отказывает", async ({ page }) => {
  await page.goto("/reset-password?token=выдуманный");

  await page.getByPlaceholder("Новый пароль").fill("long-enough-password");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();

  await expect(page.getByText(/недействительна или уже использована/)).toBeVisible();
});

test("сессия переживает перезагрузку страницы", async ({ page }) => {
  await login(page, "elmira@povod.app", "povod-demo");
  await reachFeed(page);

  await page.reload();
  // Сессия живёт в HttpOnly-куке (SEC-001): раньше она лежала в sessionStorage
  // и терялась вместе с вкладкой.
  await expect(page.getByPlaceholder("Поиск...")).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти в POVOD" })).toHaveCount(0);
});

test("новый пользователь регистрируется, создаёт повод и видит его у себя", async ({ page }) => {
  await register(page, "E2E Пользователь", uniqueEmail("author"));
  await reachFeed(page);

  const title = await createEvent(page);
  await expect(page.getByText(title)).toBeVisible();
});

test("поиск находит событие по другой форме слова", async ({ page }) => {
  await login(page, "elmira@povod.app", "povod-demo");
  await reachFeed(page);

  // «волейбол» должен находить «Пляжный волейбол» — это проверка настоящего
  // поиска на бэкенде, а не фильтрации уже загруженного списка.
  await page.getByPlaceholder("Поиск...").fill("волейбол");
  await expect(page.getByText("Пляжный волейбол")).toBeVisible();

  await page.getByPlaceholder("Поиск...").fill("бухгалтерия");
  await expect(page.getByText("Пляжный волейбол")).toHaveCount(0);
});

test("избранное сохраняется на сервере и переживает перезагрузку", async ({ page }) => {
  await login(page, "elmira@povod.app", "povod-demo");
  await reachFeed(page);

  const heart = page.getByRole("button", { name: "Добавить в избранное" }).first();
  await heart.click();
  await expect(page.getByRole("button", { name: "Убрать из избранного" }).first()).toBeVisible();

  await page.reload();
  // Отметка пришла с сервера, а не осталась в памяти вкладки.
  await expect(page.getByRole("button", { name: "Убрать из избранного" }).first()).toBeVisible();
});

test("запись на событие уведомляет его автора", async ({ page, context }) => {
  const guestEmail = uniqueEmail("guest");

  // Автор создаёт событие.
  await login(page, "elmira@povod.app", "povod-demo");
  await reachFeed(page);
  const title = await createEvent(page);

  // Гость в отдельном браузерном контексте — со своими куками.
  const guestPage = await context.browser()!.newPage();
  await register(guestPage, "Гость", guestEmail);
  await reachFeed(guestPage);
  await guestPage.getByPlaceholder("Поиск...").fill(title);
  await guestPage.getByText(title).first().click();
  await guestPage.getByRole("button", { name: "Записаться" }).click();
  await expect(guestPage.getByRole("button", { name: "Вы записаны" })).toBeVisible();
  await guestPage.close();

  // У автора появляется уведомление о новом участнике.
  await page.goto("/notifications");
  await expect(page.getByText(new RegExp(`записался на ваше событие «${title}»`))).toBeVisible();
});

test("лимит мест закрывает запись, когда свободных не осталось", async ({ page, context }) => {
  await login(page, "elmira@povod.app", "povod-demo");
  await reachFeed(page);
  // Лимит 1: автор занимает единственное место сам.
  const title = await createEvent(page, { limit: "1" });

  const guestPage = await context.browser()!.newPage();
  await register(guestPage, "Опоздавший", uniqueEmail("late"));
  await reachFeed(guestPage);
  await guestPage.getByPlaceholder("Поиск...").fill(title);
  await guestPage.getByText(title).first().click();

  await expect(guestPage.getByRole("button", { name: "Мест не осталось" })).toBeDisabled();
  await guestPage.close();
});

test("выход из аккаунта закрывает доступ к ленте", async ({ page }) => {
  await login(page, "elmira@povod.app", "povod-demo");
  await reachFeed(page);

  await page.goto("/Profile");
  await page.getByText("Выйти", { exact: false }).first().click();

  await expect(page.getByRole("button", { name: "Войти в POVOD" })).toBeVisible();
  await page.goto("/page-1");
  await expect(page.getByRole("button", { name: "Войти в POVOD" })).toBeVisible();
});
