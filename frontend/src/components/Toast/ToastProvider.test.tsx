import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger({ message, type }: { message: string; type: "success" | "error" }) {
  const showToast = useToast();
  return (
    <button type="button" onClick={() => showToast(message, { type })}>
      показать
    </button>
  );
}

describe("ToastProvider", () => {
  it("shows a success toast on demand and dismisses it on click", async () => {
    render(
      <ToastProvider>
        <Trigger message="Готово!" type="success" />
      </ToastProvider>,
    );
    expect(screen.queryByText("Готово!")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "показать" }));
    const toast = screen.getByText("Готово!");
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveAttribute("role", "status");

    await userEvent.click(toast);
    expect(screen.queryByText("Готово!")).not.toBeInTheDocument();
  });

  it("uses role=alert for error toasts", async () => {
    render(
      <ToastProvider>
        <Trigger message="Что-то не так" type="error" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "показать" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Что-то не так");
  });

  it("throws when useToast is used without a provider", () => {
    function Bare() {
      useToast();
      return null;
    }
    // React логирует пойманную ошибку в console.error — глушим ожидаемый шум.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
