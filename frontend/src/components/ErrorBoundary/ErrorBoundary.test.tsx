import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

/** Компонент, который бросает ошибку рендера по флагу. */
function Boom({ crash }: { crash: boolean }) {
  if (crash) throw new Error("boom");
  return <div>ребёнок жив</div>;
}

// Ошибка, пойманная границей, шумит в console.error — глушим на время таких тестов.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>содержимое</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("содержимое")).toBeInTheDocument();
  });

  it("shows the recovery screen and hides children when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom crash />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Что-то пошло не так");
    expect(screen.queryByText("ребёнок жив")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Попробовать снова" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Обновить страницу" })).toBeInTheDocument();
  });

  it("renders a custom fallback with the error when provided", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={(error) => <div>перехвачено: {error.message}</div>}>
        <Boom crash />
      </ErrorBoundary>,
    );
    expect(screen.getByText("перехвачено: boom")).toBeInTheDocument();
  });

  it("exposes reset via the recovery action", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom crash />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Кнопка «Попробовать снова» сбрасывает состояние границы (перемонтирует детей).
    await userEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    // Дети всё ещё бросают ошибку, поэтому экран восстановления остаётся — но клик не падает.
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
