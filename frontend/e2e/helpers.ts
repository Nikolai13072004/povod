import { expect, type Page } from "@playwright/test";

/**
 * Общие шаги сценариев (QA-005).
 *
 * Селекторы по видимому тексту и доступным именам, а не по классам: тест должен
 * ломаться, когда меняется то, что видит пользователь, и переживать правку вёрстки.
 */

/** Уникальная почта на прогон: регистрация не должна упираться в чужую запись. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@povod.test`;
}

export async function register(page: Page, name: string, email: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /Нет аккаунта/ }).click();
  await page.getByPlaceholder("Ваше имя").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Пароль").fill("e2e-password");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/SelectInterestPage|page-1/);
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти в POVOD" }).click();
  await expect(page).toHaveURL(/SelectInterestPage|page-1/);
}

/**
 * Проходит онбординг, если он показался, и оказывается в ленте.
 *
 * «Продолжить» намеренно заблокировано, пока не выбран хотя бы один интерес и
 * не заполнен город, — поэтому шаг именно такой, а не «нажать и пройти мимо».
 */
export async function reachFeed(page: Page): Promise<void> {
  if (page.url().includes("SelectInterestPage")) {
    await page.getByText("Музыка", { exact: true }).click();
    await page.getByPlaceholder("Город или адрес").fill("Москва");
    await page.getByRole("button", { name: "Продолжить" }).click();
  }
  await page.waitForURL(/page-1/);
  await expect(page.getByPlaceholder("Поиск...")).toBeVisible();
}

/** Создаёт событие через форму и возвращает его название. */
export async function createEvent(
  page: Page,
  overrides: { title?: string; limit?: string } = {},
): Promise<string> {
  const title = overrides.title ?? `Тестовый повод ${Date.now()}`;
  await page.goto("/add");
  await page.getByPlaceholder("Поход в кино").fill(title);
  await page.getByPlaceholder("Полный адрес или ссылка").fill("Кафе на углу");
  await page.getByLabel("Дата события").fill("2027-01-15");
  await page.getByLabel("Время начала").fill("18:00");
  if (overrides.limit) {
    await page.getByLabel("Ограничение числа участников").fill(overrides.limit);
  }
  await page.getByRole("button", { name: "Создать повод" }).click();
  await page.waitForURL(/events/);
  return title;
}
