import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateFilter } from "./Filters";

describe("DateFilter", () => {
  it("blocks apply and shows an error for an invalid date", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<DateFilter isOpen onClose={onClose} onSave={onSave} />);

    const input = screen.getByPlaceholderText("26.06.2026");
    await userEvent.type(input, "31022026"); // маска -> 31.02.2026 (несуществующая дата)
    await userEvent.click(screen.getByRole("button", { name: "Применить" }));

    expect(screen.getByText("Введите дату в формате ДД.ММ.ГГГГ")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("saves the masked value and closes on a valid date", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<DateFilter isOpen onClose={onClose} onSave={onSave} />);

    const input = screen.getByPlaceholderText("26.06.2026");
    await userEvent.type(input, "26062026");
    expect(input).toHaveValue("26.06.2026"); // маска расставила точки

    await userEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(onSave).toHaveBeenCalledWith("26.06.2026");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("DateFilter accessibility (UX-003)", () => {
  it("exposes the sheet as a labelled modal dialog", () => {
    render(<DateFilter isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Введите дату");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<DateFilter isOpen onClose={onClose} onSave={vi.fn()} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("moves focus into the sheet when it opens", () => {
    render(<DateFilter isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByPlaceholderText("26.06.2026")).toHaveFocus();
  });
});
