import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./ThemeContext";

/** Управляемый матчер системной темы: тесты не зависят от настроек машины. */
function mockSystemDark(isDark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("dark") ? isDark : false,
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) =>
        listeners.delete(cb),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  return listeners;
}

function Probe() {
  const { theme, preference, toggleTheme, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="preference">{preference}</span>
      <button type="button" onClick={toggleTheme}>
        переключить
      </button>
      <button type="button" onClick={() => setPreference("system")}>
        как в системе
      </button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mockSystemDark(false);
});

describe("ThemeProvider", () => {
  it("follows the system setting by default", () => {
    mockSystemDark(true);
    renderProbe();

    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    // Без явного выбора атрибут не ставится — работают медиа-правила в CSS.
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("switches to dark and marks the document", async () => {
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    await userEvent.click(screen.getByRole("button", { name: "переключить" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("remembers the explicit choice", async () => {
    const { unmount } = renderProbe();
    await userEvent.click(screen.getByRole("button", { name: "переключить" }));
    expect(localStorage.getItem("theme")).toBe("dark");
    unmount();

    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
  });

  it("can go back to following the system", async () => {
    mockSystemDark(true);
    renderProbe();

    await userEvent.click(screen.getByRole("button", { name: "переключить" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    await userEvent.click(screen.getByRole("button", { name: "как в системе" }));
    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("survives unavailable localStorage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => renderProbe()).not.toThrow();
    setItem.mockRestore();
  });
});
