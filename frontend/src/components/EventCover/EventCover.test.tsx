import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventCover } from "./EventCover";

describe("EventCover", () => {
  it("renders the image when a source is given", () => {
    render(<EventCover src="https://example.com/a.jpg" title="Пляжный волейбол" />);

    const image = screen.getByRole("img", { name: "Пляжный волейбол" });
    expect(image).toHaveAttribute("src", "https://example.com/a.jpg");
  });

  it("lazily loads images so long feeds stay light", () => {
    render(<EventCover src="https://example.com/a.jpg" title="Событие" />);
    expect(screen.getByRole("img", { name: "Событие" })).toHaveAttribute("loading", "lazy");
  });

  it("shows a placeholder instead of collapsing when there is no image", () => {
    render(<EventCover title="Событие без фото" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // Плейсхолдер декоративный и НЕ дублирует название, которое есть в карточке рядом.
    expect(screen.getByText("Без фото")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("Событие без фото")).not.toBeInTheDocument();
  });

  it("falls back to the placeholder when the image fails to load", () => {
    render(<EventCover src="https://example.com/broken.jpg" title="Битая картинка" />);

    const image = screen.getByRole("img", { name: "Битая картинка" });
    fireEvent.error(image);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Без фото")).toBeInTheDocument();
  });

  it("retries when the source changes after a failure", () => {
    const { rerender } = render(
      <EventCover src="https://example.com/broken.jpg" title="Событие" />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Событие" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    rerender(<EventCover src="https://example.com/working.jpg" title="Событие" />);
    expect(screen.getByRole("img", { name: "Событие" })).toHaveAttribute(
      "src",
      "https://example.com/working.jpg",
    );
  });
});
