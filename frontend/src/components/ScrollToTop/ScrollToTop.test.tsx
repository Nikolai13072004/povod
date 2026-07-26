import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./ScrollToTop";

function App() {
  return (
    <MemoryRouter initialEntries={["/feed"]}>
      <ScrollToTop />
      <Link to="/events">К моим событиям</Link>
      <Link to="/feed?q=test">Поиск в ленте</Link>
      <Routes>
        <Route path="/feed" element={<div>лента</div>} />
        <Route path="/events" element={<div>мои события</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

describe("ScrollToTop", () => {
  it("scrolls to the top on the initial render", () => {
    render(<App />);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("scrolls to the top when the route changes", async () => {
    render(<App />);
    vi.mocked(window.scrollTo).mockClear();

    await userEvent.click(screen.getByRole("link", { name: "К моим событиям" }));

    expect(screen.getByText("мои события")).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("does not scroll when only the query string changes", async () => {
    render(<App />);
    vi.mocked(window.scrollTo).mockClear();

    // Поиск/фильтры меняют query, но не маршрут — прокрутку сбрасывать не нужно.
    await userEvent.click(screen.getByRole("link", { name: "Поиск в ленте" }));

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
