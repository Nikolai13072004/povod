import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../components/Toast/ToastProvider";

const mockEventStore = vi.hoisted(() => ({
  createEvent: vi.fn(),
  actionError: null as string | null,
}));

vi.mock("../../stores/EventStore", () => ({ eventStore: mockEventStore }));
vi.mock("../../utils/eventDate", () => ({
  browserTimezone: () => "Europe/Moscow",
  localDateTimeToIso: () => "2026-08-01T12:00:00.000Z",
}));

import CreateEventForm from "./CreateEventForm";

function renderForm() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CreateEventForm />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockEventStore.actionError = null;
  mockEventStore.createEvent.mockResolvedValue({ id: "new-1" });
});

describe("CreateEventForm", () => {
  it("blocks submit and shows a validation error when required fields are empty", async () => {
    renderForm();
    await userEvent.click(screen.getByText("Отправить повод"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Заполните название, дату и место события.",
    );
    expect(mockEventStore.createEvent).not.toHaveBeenCalled();
  });

  it("submits a normalized payload when required fields are filled", async () => {
    const { container } = renderForm();

    await userEvent.type(screen.getByPlaceholderText("Поход в кино"), "Настолки");
    await userEvent.type(screen.getByPlaceholderText("Полный адрес или ссылка"), "Кафе в центре");
    fireEvent.change(container.querySelector('input[type="date"]')!, {
      target: { value: "2026-08-01" },
    });

    await userEvent.click(screen.getByText("Отправить повод"));

    expect(mockEventStore.createEvent).toHaveBeenCalledOnce();
    expect(mockEventStore.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Настолки",
        location: "Кафе в центре",
        startsAt: "2026-08-01T12:00:00.000Z",
        timezone: "Europe/Moscow",
        format: "public",
      }),
    );
  });
});
