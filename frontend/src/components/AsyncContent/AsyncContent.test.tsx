import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AsyncContent } from "./AsyncContent";
import { EventListSkeleton } from "../Skeleton";

const defaultProps = { loading: false, error: null, empty: false };

describe("AsyncContent", () => {
  it("shows the loading state first, before children", () => {
    render(
      <AsyncContent {...defaultProps} loading empty loadingTitle="Загружаем…">
        <div>содержимое</div>
      </AsyncContent>,
    );
    const title = screen.getByText("Загружаем…");
    expect(title).toBeInTheDocument();
    expect(screen.queryByText("содержимое")).not.toBeInTheDocument();
    // Контейнер загрузки — live-регион для скринридеров.
    expect(title.closest('[role="status"][aria-live="polite"]')).toBeInTheDocument();
  });

  it("prefers the error state over empty and renders a retry button", async () => {
    const onRetry = vi.fn();
    render(
      <AsyncContent {...defaultProps} error="Сбой сети" empty onRetry={onRetry}>
        <div>содержимое</div>
      </AsyncContent>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Сбой сети");
    expect(screen.queryByText("содержимое")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not render a retry button when onRetry is absent", () => {
    render(
      <AsyncContent {...defaultProps} error="Сбой">
        contents
      </AsyncContent>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the empty state with a description", () => {
    render(
      <AsyncContent {...defaultProps} empty emptyTitle="Пусто" emptyDescription="Ничего нет">
        <div>содержимое</div>
      </AsyncContent>,
    );
    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getByText("Ничего нет")).toBeInTheDocument();
    expect(screen.queryByText("содержимое")).not.toBeInTheDocument();
  });

  it("offers a way out of the empty state (UX-010)", async () => {
    // Пустой экран без действия — тупик: человек видит «ничего нет» и должен
    // сам догадаться, что фильтры можно сбросить.
    const reset = vi.fn();
    render(
      <AsyncContent
        {...defaultProps}
        empty
        emptyTitle="По фильтрам ничего нет"
        emptyActions={[{ label: "Сбросить фильтры", onClick: reset, mode: "primary" }]}
      >
        <div>содержимое</div>
      </AsyncContent>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("replaces the spinner with a skeleton but keeps the state announced (FE-015)", () => {
    const { container } = render(
      <AsyncContent
        {...defaultProps}
        loading
        loadingTitle="Загружаем поводы…"
        skeleton={<EventListSkeleton count={2} />}
      >
        <div>содержимое</div>
      </AsyncContent>,
    );

    // Заглушки повторяют будущую разметку...
    expect(container.querySelectorAll("[data-testid='event-card-skeleton']")).toHaveLength(2);
    // ...и скрыты от скринридеров: озвучивать серые прямоугольники нечего.
    expect(
      container.querySelector("[data-testid='event-card-skeleton']")?.closest("[aria-hidden]"),
    ).not.toBeNull();
    // Подпись остаётся, иначе тот, кто не видит экран, не узнает о загрузке.
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Загружаем поводы…")).toBeInTheDocument();
  });

  it("keeps the plain spinner when no skeleton is given", () => {
    render(
      <AsyncContent {...defaultProps} loading loadingTitle="Загружаем событие…">
        <div>содержимое</div>
      </AsyncContent>,
    );

    expect(screen.getByText("Загружаем событие…")).toBeInTheDocument();
    expect(screen.queryByTestId("event-card-skeleton")).not.toBeInTheDocument();
  });

  it("renders children when not loading, error-free and non-empty", () => {
    render(
      <AsyncContent {...defaultProps}>
        <div>содержимое</div>
      </AsyncContent>,
    );
    expect(screen.getByText("содержимое")).toBeInTheDocument();
  });
});
