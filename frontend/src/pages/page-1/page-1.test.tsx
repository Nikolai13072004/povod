import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../components/Toast/ToastProvider";

const mockEventStore = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  isLoading: false,
  // Скелетон/пустое состояние теперь опираются на `loaded`, а не на isLoading.
  loaded: false,
  error: null as string | null,
  fetchEvents: vi.fn(),
}));

vi.mock("../../stores/EventStore", () => ({ eventStore: mockEventStore }));

import { FirstPage } from "./page-1";

const sampleEvents = [
  {
    id: "1",
    title: "Пляжный волейбол",
    description: "Играем на песке",
    place: "Городской парк",
    location: "Городской парк",
    category: "Спорт",
    tags: ["Спорт"],
    startsAt: "2026-06-27T15:00:00.000Z",
    timezone: "Europe/Moscow",
    image: "",
  },
  {
    id: "2",
    title: "Вечернее караоке",
    description: "Поём хиты",
    place: "Клуб «Голос»",
    location: "Клуб «Голос»",
    category: "Музыка",
    tags: ["Музыка"],
    startsAt: "2026-06-28T19:00:00.000Z",
    timezone: "Europe/Moscow",
    image: "",
  },
];

function renderFeed() {
  // ToastProvider — часть настоящего дерева приложения: лента показывает toast
  // при добавлении в избранное и при копировании ссылки на подборку, поэтому
  // без провайдера страница не отрендерится вовсе.
  return render(
    <MemoryRouter>
      <ToastProvider>
        <FirstPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockEventStore.events = sampleEvents;
  mockEventStore.isLoading = false;
  mockEventStore.loaded = true;
  mockEventStore.error = null;
});

describe("FirstPage feed", () => {
  it("fetches events on mount and renders a card per event", () => {
    renderFeed();
    expect(mockEventStore.fetchEvents).toHaveBeenCalled();
    expect(screen.getByText("Пляжный волейбол")).toBeInTheDocument();
    expect(screen.getByText("Вечернее караоке")).toBeInTheDocument();
  });

  it("filters the list by the search query", async () => {
    renderFeed();
    await userEvent.type(screen.getByPlaceholderText("Поиск..."), "караоке");

    expect(screen.getByText("Вечернее караоке")).toBeInTheDocument();
    expect(screen.queryByText("Пляжный волейбол")).not.toBeInTheDocument();
    expect(screen.getByText(/Найдено поводов: 1/)).toBeInTheDocument();
  });

  it("shows the loading state while first fetch is in flight", () => {
    mockEventStore.events = [];
    mockEventStore.isLoading = true;
    mockEventStore.loaded = false;
    renderFeed();
    expect(screen.getByText("Загружаем поводы…")).toBeInTheDocument();
  });

  it("до первой загрузки показывает скелетон, а не «Пока нет поводов»", () => {
    // На монтировании loaded=false и isLoading ещё false: раньше на кадр
    // проскакивало пустое состояние.
    mockEventStore.events = [];
    mockEventStore.isLoading = false;
    mockEventStore.loaded = false;
    renderFeed();
    expect(screen.getByText("Загружаем поводы…")).toBeInTheDocument();
    expect(screen.queryByText("Пока нет поводов")).not.toBeInTheDocument();
  });

  it("shows the error state with a retry action", () => {
    mockEventStore.events = [];
    mockEventStore.loaded = false;
    mockEventStore.error = "Сбой сети";
    renderFeed();
    expect(screen.getByText("Не удалось загрузить ленту")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });
});
