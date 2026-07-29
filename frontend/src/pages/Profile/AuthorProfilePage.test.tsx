import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockApi = vi.hoisted(() => ({
  getUser: vi.fn(),
  getByAuthor: vi.fn(),
  getFriends: vi.fn(),
  getFriendRequests: vi.fn(),
  addFriend: vi.fn(),
  acceptFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
}));

vi.mock("../../services/api", () => ({
  usersAPI: {
    getById: mockApi.getUser,
    getFriends: mockApi.getFriends,
    getFriendRequests: mockApi.getFriendRequests,
    addFriend: mockApi.addFriend,
    acceptFriendRequest: mockApi.acceptFriendRequest,
    removeFriend: mockApi.removeFriend,
  },
  eventsAPI: { getByAuthor: mockApi.getByAuthor },
}));

vi.mock("../../stores/sessionStore", () => ({
  sessionStore: { user: { id: "me", name: "Я", createdAt: "2026-01-01T00:00:00.000Z" } },
}));

import { ToastProvider } from "../../components/Toast/ToastProvider";
import { friendsStore } from "../../stores/friendsStore";
import { AuthorProfilePage } from "./AuthorProfilePage";

const author = {
  id: "u1",
  name: "Эльмира Гильманова",
  avatar: "https://example.com/a.png",
  city: "Казань",
  interests: ["IT", "Музыка"],
};

const authorEvents = [
  {
    id: "1",
    title: "Пляжный волейбол",
    startsAt: "2026-06-27T15:00:00.000Z",
    timezone: "Europe/Moscow",
    location: "Круглотский сад",
  },
];

function renderPage(path = "/users/u1") {
  // ToastProvider — часть настоящего дерева: страница показывает toast при
  // отправке заявки в друзья, и без провайдера useToast бросает исключение.
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/users/:id" element={<AuthorProfilePage />} />
          <Route path="/page-1/:id" element={<div>страница события</div>} />
          <Route path="/chats/:userId" element={<div>переписка</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Связь живёт в сторе-синглтоне: без сброса состояние течёт между тестами.
  friendsStore.reset();
  mockApi.getUser.mockResolvedValue({ data: author, status: 200 });
  mockApi.getByAuthor.mockResolvedValue({ data: authorEvents, status: 200 });
  mockApi.getFriends.mockResolvedValue({ data: [], status: 200 });
  mockApi.getFriendRequests.mockResolvedValue({
    data: { incoming: [], outgoing: [] },
    status: 200,
  });
});

describe("AuthorProfilePage", () => {
  it("shows the author's public details", async () => {
    renderPage();

    expect(await screen.findByText("Эльмира Гильманова")).toBeInTheDocument();
    expect(screen.getByText("Казань")).toBeInTheDocument();
    expect(screen.getByText("IT")).toBeInTheDocument();
    expect(screen.getByText("Музыка")).toBeInTheDocument();
  });

  it("never renders an email, even if the API leaks one", async () => {
    mockApi.getUser.mockResolvedValue({
      data: { ...author, email: "elmira@povod.app" },
      status: 200,
    });
    renderPage();

    await screen.findByText("Эльмира Гильманова");
    expect(screen.queryByText(/elmira@povod\.app/)).not.toBeInTheDocument();
  });

  it("lists the author's public events and opens one", async () => {
    renderPage();

    expect(await screen.findByText("Открытые события (1)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Пляжный волейбол/ }));
    expect(screen.getByText("страница события")).toBeInTheDocument();
  });

  it("explains an empty event list", async () => {
    mockApi.getByAuthor.mockResolvedValue({ data: [], status: 200 });
    renderPage();

    expect(await screen.findByText("Пока нет открытых событий")).toBeInTheDocument();
  });

  it("shows a not-found state for a missing user", async () => {
    mockApi.getUser.mockResolvedValue({ data: null, status: 404 });
    renderPage();

    expect(await screen.findByText("Пользователь не найден")).toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    mockApi.getUser.mockResolvedValue({ error: "Сбой сети", status: 500 });
    renderPage();

    expect(await screen.findByText("Не удалось открыть профиль")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});

describe("связь с человеком", () => {
  /** Сервер после действия отдаёт новое состояние — стор перечитывает его целиком. */
  const serverSays = (state: { friends?: boolean; incoming?: boolean; outgoing?: boolean }) => {
    mockApi.getFriends.mockResolvedValue({ data: state.friends ? [author] : [], status: 200 });
    mockApi.getFriendRequests.mockResolvedValue({
      data: {
        incoming: state.incoming ? [author] : [],
        outgoing: state.outgoing ? [author] : [],
      },
      status: 200,
    });
  };

  it("до ответа сервера кнопок нет вовсе", async () => {
    /*
     * Раньше начальным состоянием было «не друзья», и у настоящего друга
     * рисовалась кнопка «Добавить в друзья»: нажатие возвращало «уже друзья»,
     * статус прыгал обратно, и снаружи это выглядело как «показывает неправду,
     * пока не обновишь страницу».
     */
    let release: (value: unknown) => void = () => {};
    mockApi.getFriends.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    renderPage();

    await screen.findByText("Эльмира Гильманова");
    expect(screen.queryByRole("button", { name: "Добавить в друзья" })).not.toBeInTheDocument();

    release({ data: [author], status: 200 });
    expect(await screen.findByRole("button", { name: "Написать" })).toBeInTheDocument();
  });

  it("даёт отправить заявку — до этого сделать это было негде вовсе", async () => {
    mockApi.addFriend.mockImplementation(async () => {
      serverSays({ outgoing: true });
      return { data: { status: "pending" }, status: 201 };
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Добавить в друзья" }));

    expect(mockApi.addFriend).toHaveBeenCalledWith("me", "u1");
    expect(await screen.findByRole("button", { name: "Отменить заявку" })).toBeInTheDocument();
  });

  it("встречная заявка принимается тем же нажатием", async () => {
    serverSays({ incoming: true });
    mockApi.addFriend.mockImplementation(async () => {
      serverSays({ friends: true });
      return { data: { status: "accepted" }, status: 200 };
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Принять заявку" }));
    expect(await screen.findByRole("button", { name: "Написать" })).toBeInTheDocument();
  });

  it("у друга появляется переход в переписку", async () => {
    serverSays({ friends: true });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Написать" }));
    expect(await screen.findByText("переписка")).toBeInTheDocument();
  });

  it("убрать из друзей меняет кнопку без перезагрузки", async () => {
    serverSays({ friends: true });
    mockApi.removeFriend.mockImplementation(async () => {
      serverSays({});
      return { status: 204 };
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Убрать из друзей" }));
    expect(await screen.findByRole("button", { name: "Добавить в друзья" })).toBeInTheDocument();
  });

  it("на своём профиле кнопок связи нет", async () => {
    mockApi.getUser.mockResolvedValue({ data: { ...author, id: "me" }, status: 200 });
    renderPage("/users/me");

    await screen.findByText("Эльмира Гильманова");
    expect(screen.queryByRole("button", { name: "Добавить в друзья" })).not.toBeInTheDocument();
  });
});
