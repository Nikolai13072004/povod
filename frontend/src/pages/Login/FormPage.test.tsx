import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockSession = vi.hoisted(() => ({
  initialized: false,
  authenticated: false,
  error: null as string | null,
  isLoading: false,
  isVK: false,
  user: { name: "Гость", avatar: "" },
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock("../../stores/sessionStore", () => ({ sessionStore: mockSession }));
vi.mock("../../config", () => ({
  appConfig: { demoAuthEnabled: true, apiBaseUrl: "http://localhost:8080/" },
}));

import { MyLoginForm } from "./FormPage";

function renderForm() {
  return render(
    <MemoryRouter>
      <MyLoginForm />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockSession.initialized = false;
  mockSession.authenticated = false;
  mockSession.error = null;
  mockSession.isLoading = false;
  mockSession.isVK = false;
  localStorage.clear();
  mockSession.login.mockResolvedValue(true);
  mockSession.register.mockResolvedValue(true);
});

describe("MyLoginForm", () => {
  it("submits demo credentials via sessionStore.login", async () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Войти в POVOD" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Войти в POVOD" }));
    expect(mockSession.login).toHaveBeenCalledWith("elmira@povod.app", "povod-demo");
  });

  it("switches to registration mode and reveals the name field", async () => {
    renderForm();
    expect(screen.queryByPlaceholderText("Ваше имя")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Нет аккаунта? Зарегистрироваться"));

    expect(screen.getByPlaceholderText("Ваше имя")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать аккаунт" })).toBeInTheDocument();
  });

  it("shows the server error from the store", () => {
    mockSession.error = "Неверный email или пароль";
    renderForm();
    expect(screen.getByText("Неверный email или пароль")).toBeInTheDocument();
  });
});
