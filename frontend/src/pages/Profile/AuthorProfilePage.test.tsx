import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockApi = vi.hoisted(() => ({
  getUser: vi.fn(),
  getByAuthor: vi.fn(),
}));

vi.mock("../../services/api", () => ({
  usersAPI: { getById: mockApi.getUser },
  eventsAPI: { getByAuthor: mockApi.getByAuthor },
}));

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

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/users/u1"]}>
      <Routes>
        <Route path="/users/:id" element={<AuthorProfilePage />} />
        <Route path="/page-1/:id" element={<div>страница события</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockApi.getUser.mockResolvedValue({ data: author, status: 200 });
  mockApi.getByAuthor.mockResolvedValue({ data: authorEvents, status: 200 });
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
