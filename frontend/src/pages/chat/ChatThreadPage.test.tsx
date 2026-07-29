import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../../components/Toast/ToastProvider";
import type { DirectMessage } from "../../services/api";

interface ThreadShape {
  peer?: { id: string; name: string; createdAt: string };
  messages: DirectMessage[];
  loading: boolean;
  loadingMore: boolean;
  sending: boolean;
  error: string | null;
  sendError: string | null;
  loaded: boolean;
  notFound: boolean;
  nextCursor?: string;
  canSend: boolean;
}

const baseThread = (): ThreadShape => ({
  peer: { id: "u2", name: "Сергей", createdAt: "2026-01-01T00:00:00.000Z" },
  messages: [],
  loading: false,
  loadingMore: false,
  sending: false,
  error: null,
  sendError: null,
  loaded: true,
  notFound: false,
  canSend: true,
});

const mockChatStore = vi.hoisted(() => ({
  state: {} as ThreadShape,
  thread: vi.fn(),
  loadThread: vi.fn(() => Promise.resolve()),
  loadOlder: vi.fn(),
  markRead: vi.fn(() => Promise.resolve()),
  send: vi.fn(() => Promise.resolve(true)),
  edit: vi.fn(() => Promise.resolve(true)),
  remove: vi.fn(() => Promise.resolve(true)),
  startThreadPolling: vi.fn(),
  stopThreadPolling: vi.fn(),
}));

vi.mock("../../stores/chatStore", () => ({ chatStore: mockChatStore }));
vi.mock("../../stores/sessionStore", () => ({
  sessionStore: { user: { id: "u1", name: "Я", createdAt: "2026-01-01T00:00:00.000Z" } },
}));

import { ChatThreadPage } from "./ChatThreadPage";

const message = (overrides: Partial<DirectMessage> = {}): DirectMessage => ({
  id: "m1",
  senderId: "u2",
  recipientId: "u1",
  text: "привет",
  createdAt: "2026-07-01T10:00:00.000Z",
  ...overrides,
});

function renderThread() {
  return render(
    <MemoryRouter initialEntries={["/chats/u2"]}>
      <ToastProvider>
        <Routes>
          <Route path="/chats/:userId" element={<ChatThreadPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChatStore.state = baseThread();
  mockChatStore.thread.mockImplementation(() => mockChatStore.state);
  mockChatStore.send.mockResolvedValue(true);
});

describe("переписка", () => {
  it("на первой загрузке показывает скелетон пузырей", () => {
    mockChatStore.state = { ...baseThread(), loading: true, loaded: false };
    renderThread();
    expect(screen.getAllByTestId("message-skeleton").length).toBeGreaterThan(0);
  });

  it("запускает и останавливает опрос вместе с экраном", () => {
    const { unmount } = renderThread();
    expect(mockChatStore.startThreadPolling).toHaveBeenCalledWith("u2");
    unmount();
    // Забытая остановка не падает, а тихо копит таймеры и слушателей.
    expect(mockChatStore.stopThreadPolling).toHaveBeenCalled();
  });

  it("отмечает переписку прочитанной при открытии", async () => {
    renderThread();
    await vi.waitFor(() => expect(mockChatStore.markRead).toHaveBeenCalledWith("u2"));
  });

  it("отправляет текст и очищает поле только после успеха", async () => {
    mockChatStore.state = { ...baseThread(), messages: [message()] };
    renderThread();

    const input = screen.getByLabelText("Текст сообщения");
    await userEvent.type(input, "как дела");
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(mockChatStore.send).toHaveBeenCalledWith("u2", "как дела");
    await vi.waitFor(() => expect(input).toHaveValue(""));
  });

  it("не даёт отправить пустое сообщение", () => {
    renderThread();
    expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
  });

  it("при отказе сервера текст остаётся в поле", async () => {
    mockChatStore.send.mockResolvedValue(false);
    mockChatStore.state = { ...baseThread(), sendError: "вы больше не друзья" };
    renderThread();

    const input = screen.getByLabelText("Текст сообщения");
    await userEvent.type(input, "привет");
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));

    // Иначе человек решит, что сообщение ушло, и не наберёт его заново.
    await vi.waitFor(() => expect(input).toHaveValue("привет"));
  });

  it("без права писать поле ввода заменяется объяснением", () => {
    mockChatStore.state = { ...baseThread(), canSend: false, messages: [message()] };
    renderThread();

    expect(screen.queryByLabelText("Текст сообщения")).not.toBeInTheDocument();
    expect(screen.getByText(/Писать можно только друзьям/)).toBeInTheDocument();
    // История при этом остаётся: написанное не исчезает от расторжения дружбы.
    expect(screen.getByText("привет")).toBeInTheDocument();
  });

  it("правку и удаление показывает только у своих сообщений", () => {
    mockChatStore.state = {
      ...baseThread(),
      messages: [message({ id: "mine", senderId: "u1", recipientId: "u2", text: "моё" })],
    };
    renderThread();

    expect(screen.getByRole("button", { name: "Изменить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
  });

  it("у чужого сообщения правки нет", () => {
    mockChatStore.state = { ...baseThread(), messages: [message()] };
    renderThread();

    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
  });

  it("отметку «изменён» видно, а не подменяет текст молча", () => {
    mockChatStore.state = {
      ...baseThread(),
      messages: [message({ editedAt: "2026-07-01T11:00:00.000Z" })],
    };
    renderThread();

    expect(screen.getByText("изменён")).toBeInTheDocument();
  });

  it("галочка прочтения различает отправленное и прочитанное", () => {
    mockChatStore.state = {
      ...baseThread(),
      messages: [
        message({
          id: "read",
          senderId: "u1",
          recipientId: "u2",
          readAt: "2026-07-01T12:00:00.000Z",
        }),
        message({ id: "sent", senderId: "u1", recipientId: "u2" }),
      ],
    };
    renderThread();

    expect(screen.getByLabelText("Прочитано")).toBeInTheDocument();
    expect(screen.getByLabelText("Отправлено")).toBeInTheDocument();
  });

  it("недоступную переписку объясняет и даёт выход", () => {
    mockChatStore.state = { ...baseThread(), notFound: true, peer: undefined };
    renderThread();

    expect(screen.getByText("Переписка недоступна")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "К перепискам" })).toBeInTheDocument();
  });

  it("предлагает показать историю, пока есть следующая страница", async () => {
    mockChatStore.state = { ...baseThread(), messages: [message()], nextCursor: "cursor" };
    renderThread();

    await userEvent.click(screen.getByRole("button", { name: "Показать раньше" }));
    expect(mockChatStore.loadOlder).toHaveBeenCalledWith("u2");
  });
});
