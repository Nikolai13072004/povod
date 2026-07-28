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
  // Учитываем переданное время: иначе начало и окончание были бы одним моментом,
  // и проверка их порядка ничего бы не проверяла.
  localDateTimeToIso: (date: string, time?: string) =>
    new Date(`${date}T${time || "12:00"}:00+03:00`).toISOString(),
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

  it("does not offer a choice it cannot honour", () => {
    renderForm();

    // Переключатель «Точный повод / Идея» ничего не менял: значение не попадало
    // ни в запрос, ни в состояние формы — только подсвечивало кнопку. Пользователю
    // это обещало два разных сценария создания, которых не существует.
    expect(screen.queryByText("Идея")).toBeNull();
    expect(screen.queryByText("Точный повод")).toBeNull();
  });

  it("sends the end time and the seat limit when they are filled in", async () => {
    const { container } = renderForm();

    await userEvent.type(screen.getByPlaceholderText("Поход в кино"), "Настолки");
    await userEvent.type(screen.getByPlaceholderText("Полный адрес или ссылка"), "Кафе");
    fireEvent.change(container.querySelector('input[type="date"]')!, {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Время окончания"), { target: { value: "22:00" } });
    await userEvent.type(screen.getByLabelText("Ограничение числа участников"), "5");

    await userEvent.click(screen.getByText("Отправить повод"));

    expect(mockEventStore.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ endsAt: "2026-08-01T19:00:00.000Z", participantLimit: 5 }),
    );
  });

  it("refuses an end time that precedes the start", async () => {
    const { container } = renderForm();

    await userEvent.type(screen.getByPlaceholderText("Поход в кино"), "Настолки");
    await userEvent.type(screen.getByPlaceholderText("Полный адрес или ссылка"), "Кафе");
    fireEvent.change(container.querySelector('input[type="date"]')!, {
      target: { value: "2026-08-01" },
    });
    // Мок дат отдаёт одинаковый момент для обоих полей — окончание не позже начала.
    fireEvent.change(screen.getByLabelText("Время окончания"), { target: { value: "10:00" } });

    await userEvent.click(screen.getByText("Отправить повод"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Событие не может закончиться раньше, чем началось.",
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
        // 12:00 по Москве — время по умолчанию, когда поле не заполнено.
        startsAt: "2026-08-01T09:00:00.000Z",
        timezone: "Europe/Moscow",
        format: "public",
      }),
    );
  });
});
