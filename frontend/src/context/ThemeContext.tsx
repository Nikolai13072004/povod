import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Тема оформления (UX-001).
 *
 * Раньше `toggleTheme` всегда выставлял «светлую», а переключателя в интерфейсе
 * не было вовсе — тёмная тема существовала только на бумаге. Теперь:
 *   - `system` (по умолчанию) — следуем настройке операционной системы;
 *   - `light` / `dark` — явный выбор пользователя, он запоминается.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

interface ThemeContextType {
  /** Что выбрал пользователь. */
  preference: ThemePreference;
  /** Какая тема реально применена сейчас. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Переключение «светлая ↔ тёмная» одной кнопкой. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage может быть недоступен (приватный режим) — тихо откатываемся.
  }
  return "system";
}

function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemPreference, setSystemPreference] = useState<ResolvedTheme>(systemTheme);

  // Пока выбран режим «как в системе», следим за её изменением на лету.
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemPreference(event.matches ? "dark" : "light");
    query.addEventListener?.("change", handleChange);
    return () => query.removeEventListener?.("change", handleChange);
  }, []);

  const theme: ResolvedTheme = preference === "system" ? systemPreference : preference;

  useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") {
      // Без атрибута работают медиа-правила `prefers-color-scheme` из tokens.css.
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", preference);
    }
    // Подсказка браузеру: системные элементы (скроллбары, поля) тоже перекрасятся.
    root.style.colorScheme = theme;
  }, [preference, theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Не сохранили — тема всё равно применится на эту сессию.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme, setPreference]);

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
