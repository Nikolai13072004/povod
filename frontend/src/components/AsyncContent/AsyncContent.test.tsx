import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AsyncContent } from "./AsyncContent";

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

  it("renders children when not loading, error-free and non-empty", () => {
    render(
      <AsyncContent {...defaultProps}>
        <div>содержимое</div>
      </AsyncContent>,
    );
    expect(screen.getByText("содержимое")).toBeInTheDocument();
  });
});
