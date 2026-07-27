import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Проверки манифеста (PWA-001).
 *
 * Манифест — это файл, который никто не открывает: он не типизирован, не
 * участвует в сборке и ломается молча. Ошибку в нём замечают, только когда
 * браузер перестаёт предлагать установку, а иконка на домашнем экране
 * оказывается пустым квадратом. Поэтому требования установимости и связь с
 * токенами оформления зафиксированы тестами.
 */

// Vitest переписывает `import.meta.url` под свой резолвер, поэтому пути
// строятся от корня проекта — его vitest и делает рабочей директорией.
const projectFile = (path: string) => resolve(process.cwd(), path);
const publicFile = (path: string) => projectFile(`public/${path}`);

const manifest = JSON.parse(readFileSync(publicFile("manifest.webmanifest"), "utf8")) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  shortcuts?: Array<{ name: string; url: string }>;
};

const indexHtml = readFileSync(projectFile("index.html"), "utf8");
const tokensCss = readFileSync(projectFile("src/styles/tokens.css"), "utf8");

/** Размер PNG лежит в заголовке IHDR: сигнатура (8) + длина (4) + тип (4). */
function pngSize(file: Buffer): { width: number; height: number } {
  expect(file.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

describe("манифест приложения", () => {
  it("содержит поля, без которых браузер не предложит установку", () => {
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");

    // Под иконкой на домашнем экране помещается около 12 символов.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("объявляет обязательные размеры иконок и maskable-вариант", () => {
    const png = manifest.icons.filter((icon) => icon.type === "image/png");
    const sizes = png.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    // Без maskable система обрежет иконку своей формой прямо по знаку.
    const maskable = manifest.icons.filter((icon) => icon.purpose === "maskable");
    expect(maskable.length).toBeGreaterThan(0);
    expect(maskable.map((icon) => icon.sizes)).toContain("512x512");
  });

  it("ссылается на существующие файлы, и заявленный размер совпадает с настоящим", () => {
    for (const icon of manifest.icons) {
      const file = readFileSync(publicFile(icon.src.replace(/^\//, "")));
      expect(file.length, `${icon.src} пуст`).toBeGreaterThan(0);

      if (icon.type !== "image/png") continue;
      const [declared] = icon.sizes.split(" ");
      const [width, height] = declared.split("x").map(Number);
      // Иначе на домашнем экране окажется размытая или обрезанная иконка.
      expect(pngSize(file), `${icon.src}`).toEqual({ width, height });
    }
  });

  it("отдаёт разбираемый SVG: битый браузер просто не покажет", () => {
    const svg = readFileSync(publicFile("icons/icon.svg"), "utf8");
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");

    // SVG разбирается как XML, а он строже HTML: например, двойной дефис внутри
    // комментария — ошибка разбора, и иконка не отрисуется целиком.
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.documentElement.getAttribute("viewBox")).toBe("0 0 512 512");
  });

  it("использует цвет фона из токенов оформления", () => {
    const light = tokensCss.match(/--povod-bg:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(light).toBeTruthy();
    // Заставка и системная панель не должны разъезжаться с самим приложением.
    expect(manifest.background_color).toBe(light);
    expect(manifest.theme_color).toBe(light);
  });

  it("подключён из index.html вместе с иконкой для iOS", () => {
    expect(indexHtml).toContain('rel="manifest"');
    // iOS манифест игнорирует: без apple-touch-icon получится скриншот страницы.
    expect(indexHtml).toContain('rel="apple-touch-icon"');
    expect(indexHtml).toContain('name="theme-color"');
  });

  it("ведёт ярлыки на существующие маршруты приложения", () => {
    const routes = readFileSync(projectFile("src/app/router.tsx"), "utf8");
    for (const shortcut of manifest.shortcuts ?? []) {
      expect(routes, `ярлык «${shortcut.name}»`).toContain(`"${shortcut.url.replace(/^\//, "")}"`);
    }
  });
});
