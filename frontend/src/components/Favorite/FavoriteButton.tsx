import styled from "@emotion/styled";
import { observer } from "mobx-react-lite";
import { favoritesStore } from "../../stores/favoritesStore";
import { sessionStore } from "../../stores/sessionStore";
import { useToast } from "../Toast/ToastProvider";

const Button = styled.button<{ $active: boolean }>`
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--povod-surface);
  box-shadow: var(--povod-shadow-card);
  color: ${(props) => (props.$active ? "var(--povod-danger)" : "var(--povod-text-secondary)")};
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

interface FavoriteButtonProps {
  eventId: string;
  /** Останавливать всплытие: кнопка часто лежит внутри кликабельной карточки. */
  stopPropagation?: boolean;
  className?: string;
}

/**
 * Сердечко «в избранное» (PROD-001).
 *
 * Заливка и обводка — один и тот же путь: у пустого сердца `fill: none`, у
 * полного — `currentColor`. Так силуэт совпадает в обоих состояниях, и при
 * переключении иконка не «дёргается».
 */
export const FavoriteButton = observer(
  ({ eventId, stopPropagation = true, className }: FavoriteButtonProps) => {
    const showToast = useToast();
    const isFavorite = favoritesStore.has(eventId);
    const isPending = favoritesStore.isPending(eventId);

    // Аноним отметку сохранить не сможет: серверу некуда её записать.
    if (!sessionStore.authenticated) return null;

    const handleClick = async (clickEvent: React.MouseEvent) => {
      if (stopPropagation) {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      }
      const wasFavorite = isFavorite;
      const nowFavorite = await favoritesStore.toggle(eventId);
      if (nowFavorite === wasFavorite) {
        showToast("Не удалось изменить избранное", { type: "error" });
        return;
      }
      showToast(nowFavorite ? "Добавлено в избранное" : "Убрано из избранного", {
        type: "success",
      });
    };

    return (
      <Button
        type="button"
        className={className}
        $active={isFavorite}
        disabled={isPending}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
        title={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
        onClick={handleClick}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill={isFavorite ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20.5 3.8 12.3a5 5 0 0 1 7.1-7.1l1.1 1.1 1.1-1.1a5 5 0 0 1 7.1 7.1z" />
        </svg>
      </Button>
    );
  },
);
