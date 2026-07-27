import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../components/Toast/ToastProvider";

const mockEventStore = vi.hoisted(() => ({
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  actionError: null as string | null,
}));

vi.mock("../../stores/EventStore", () => ({ eventStore: mockEventStore }));

import { EventOwnerControls } from "./EventOwnerControls";

const event = {
  id: "1",
  title: "Пляжный волейбол",
  description: "Играем на песке",
  startsAt: "2026-06-27T15:00:00.000Z",
  timezone: "Europe/Moscow",
  location: "Круглотский сад",
  authorId: "u1",
};

function renderControls(onDeleted = vi.fn()) {
  render(
    <ToastProvider>
      <EventOwnerControls event={event} onDeleted={onDeleted} />
    </ToastProvider>,
  );
  return { onDeleted };
}

beforeEach(() => {
  mockEventStore.actionError = null;
  mockEventStore.updateEvent.mockResolvedValue({ ...event, title: "Новое название" });
  mockEventStore.deleteEvent.mockResolvedValue(true);
});

describe("EventOwnerControls", () => {
  it("offers edit and delete to the author", () => {
    renderControls();
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
  });

  it("prefills the edit form with the event's local date and time", async () => {
    renderControls();
    await userEvent.click(screen.getByRole("button", { name: "Редактировать" }));

    expect(screen.getByLabelText("Название")).toHaveValue("Пляжный волейбол");
    expect(screen.getByLabelText("Место")).toHaveValue("Круглотский сад");
    // 15:00 UTC = 18:00 в Москве 27 июня.
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-06-27");
    expect(screen.getByLabelText("Время начала")).toHaveValue("18:00");
  });

  it("saves an edited title through the store", async () => {
    renderControls();
    await userEvent.click(screen.getByRole("button", { name: "Редактировать" }));

    const titleInput = screen.getByLabelText("Название");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Новое название");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(mockEventStore.updateEvent).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ title: "Новое название", location: "Круглотский сад" }),
    );
  });

  it("blocks saving when a required field is emptied", async () => {
    renderControls();
    await userEvent.click(screen.getByRole("button", { name: "Редактировать" }));

    await userEvent.clear(screen.getByLabelText("Название"));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Заполните название, дату и место");
    expect(mockEventStore.updateEvent).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting and reports back", async () => {
    const { onDeleted } = renderControls();

    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(screen.getByText("Удалить событие?")).toBeInTheDocument();
    expect(mockEventStore.deleteEvent).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(mockEventStore.deleteEvent).toHaveBeenCalledWith("1");
    expect(onDeleted).toHaveBeenCalled();
  });

  it("keeps the user on the page when deletion fails", async () => {
    mockEventStore.deleteEvent.mockResolvedValue(false);
    mockEventStore.actionError = "Только автор может удалить событие";
    const { onDeleted } = renderControls();

    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Только автор может удалить событие");
  });
});
