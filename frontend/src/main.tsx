import { createRoot } from "react-dom/client";
import bridge from "@vkontakte/vk-bridge";
import "./index.css";
import "./styles/global.css";
import { theme } from "./styles/theme.ts";
import { ThemeProvider } from "@emotion/react";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router.tsx";
import { ThemeProvider as CustomThemeProvider } from "./context/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary.tsx";

// Инициализация VK Bridge (обязательна для VK Mini Apps).
// Вне среды VK вызов безопасно игнорируется.
bridge.send("VKWebAppInit").catch(() => {
  /* приложение открыто не внутри ВКонтакте — это нормально для локальной разработки */
});

createRoot(document.getElementById("root")!).render(
  <CustomThemeProvider>
    <ThemeProvider theme={theme}>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </ThemeProvider>
  </CustomThemeProvider>,
);
