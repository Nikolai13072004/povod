import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({
  getFriendRequests: vi.fn(),
  acceptFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
}));

vi.mock("../../services/api", () => ({ usersAPI: api }));
vi.mock("../../components/Toast/ToastProvider", () => ({ useToast: () => vi.fn() }));

import { FriendRequests } from "./FriendRequests";

const user = (id: string, name: string) => ({ id, name, createdAt: "2026-01-01T00:00:00.000Z" });

beforeEach(() => {
  vi.clearAllMocks();
  api.acceptFriendRequest.mockResolvedValue({ status: 204 });
  api.removeFriend.mockResolvedValue({ status: 204 });
});

describe("заявки в друзья", () => {
  it("не занимает место, когда заявок нет", async () => {
    api.getFriendRequests.mockResolvedValue({ data: { incoming: [], outgoing: [] }, status: 200 });
    const { container } = render(<FriendRequests userId="u1" onAccepted={vi.fn()} />);

    await waitFor(() => expect(api.getFriendRequests).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("показывает входящие и даёт их принять", async () => {
    api.getFriendRequests.mockResolvedValue({
      data: { incoming: [user("u2", "Борис")], outgoing: [] },
      status: 200,
    });
    const onAccepted = vi.fn();
    render(<FriendRequests userId="u1" onAccepted={onAccepted} />);

    await screen.findByText("Борис");
    await userEvent.click(screen.getByRole("button", { name: "Принять" }));

    expect(api.acceptFriendRequest).toHaveBeenCalledWith("u1", "u2");
    // Родитель обязан перечитать друзей: принятая заявка меняет их список.
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  });

  it("отклонение входящей и отзыв своей — одно и то же действие", async () => {
    api.getFriendRequests.mockResolvedValue({
      data: { incoming: [user("u2", "Борис")], outgoing: [user("u3", "Вера")] },
      status: 200,
    });
    render(<FriendRequests userId="u1" onAccepted={vi.fn()} />);

    await screen.findByText("Вера");
    await userEvent.click(screen.getByRole("button", { name: "Отклонить" }));
    expect(api.removeFriend).toHaveBeenCalledWith("u1", "u2");

    await userEvent.click(screen.getByRole("button", { name: "Отозвать" }));
    expect(api.removeFriend).toHaveBeenCalledWith("u1", "u3");
  });

  it("показывает исходящие — иначе непонятно, ушла ли заявка", async () => {
    api.getFriendRequests.mockResolvedValue({
      data: { incoming: [], outgoing: [user("u3", "Вера")] },
      status: 200,
    });
    render(<FriendRequests userId="u1" onAccepted={vi.fn()} />);

    expect(await screen.findByText("Вера")).toBeInTheDocument();
    expect(screen.getByText("ждёт ответа")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Принять" })).not.toBeInTheDocument();
  });
});
