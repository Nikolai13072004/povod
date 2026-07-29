import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../components/Toast/ToastProvider";
import type { Dialog } from "../../services/api";

const mockChatStore = vi.hoisted(() => ({
  dialogs: [] as Dialog[],
  visibleDialogs: [] as Dialog[],
  dialogsLoading: false,
  dialogsError: null as string | null,
  search: "",
  loadDialogs: vi.fn(),
  setSearch: vi.fn(),
  startDialogsPolling: vi.fn(),
  stopDialogsPolling: vi.fn(),
}));

vi.mock("../../stores/chatStore", () => ({ chatStore: mockChatStore }));

import { ChatList } from "./ChatPage";

const dialog = (overrides: Partial<Dialog> = {}): Dialog => ({
  peer: { id: "u2", name: "Сергей", createdAt: "2026-01-01T00:00:00.000Z" },
  lastMessage: {
    id: "m1",
    senderId: "u2",
    recipientId: "u1",
    text: "привет",
    createdAt: "2026-07-01T10:00:00.000Z",
  },
  unread: 0,
  ...overrides,
});

function renderList() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ChatList />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockChatStore.dialogs = [];
  mockChatStore.visibleDialogs = [];
  mockChatStore.dialogsLoading = false;
  mockChatStore.dialogsError = null;
  mockChatStore.search = "";
  vi.clearAllMocks();
});

describe("список переписок", () => {
  it("на первой загрузке показывает скелетон, а не спиннер", () => {
    mockChatStore.dialogsLoading = true;
    renderList();
    expect(screen.getAllByTestId("dialog-skeleton").length).toBeGreaterThan(0);
  });

  it("показывает собеседника, обрывок реплики и счётчик непрочитанных", () => {
    const item = dialog({ unread: 3 });
    mockChatStore.dialogs = [item];
    mockChatStore.visibleDialogs = [item];
    renderList();

    expect(screen.getByText("Сергей")).toBeInTheDocument();
    expect(screen.getByText("привет")).toBeInTheDocument();
    expect(screen.getByLabelText("3 непрочитанных")).toBeInTheDocument();
  });

  it("отмечает свою реплику, иначе её не отличить от чужой", () => {
    const mine = dialog({
      lastMessage: { ...dialog().lastMessage, senderId: "u1", recipientId: "u2" },
    });
    mockChatStore.dialogs = [mine];
    mockChatStore.visibleDialogs = [mine];
    renderList();

    expect(screen.getByText("Вы: привет")).toBeInTheDocument();
  });

  it("из пустого состояния есть выход, а не только сообщение «ничего нет»", () => {
    renderList();

    expect(screen.getByText("Переписок пока нет")).toBeInTheDocument();
    // Объяснение правила обязательно: иначе непонятно, почему список пуст.
    expect(screen.getByText(/принял вашу заявку в друзья/)).toBeInTheDocument();
    // Ведёт к людям, а не в свой профиль: чтобы появилась первая переписка,
    // нужно сначала кого-то найти и подружиться.
    expect(screen.getByRole("button", { name: "Найти людей" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть ленту" })).toBeInTheDocument();
  });

  it("при активном поиске предлагает сбросить его, а не идти в друзья", async () => {
    mockChatStore.dialogs = [dialog()];
    mockChatStore.search = "никого";
    renderList();

    expect(screen.getByText("Ничего не найдено")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Сбросить поиск" }));
    expect(mockChatStore.setSearch).toHaveBeenCalledWith("");
  });

  it("ошибку показывает с возможностью повторить", async () => {
    mockChatStore.dialogsError = "Сеть недоступна";
    renderList();

    expect(screen.getByRole("alert")).toHaveTextContent("Сеть недоступна");
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(mockChatStore.loadDialogs).toHaveBeenCalledWith(true);
  });
});
