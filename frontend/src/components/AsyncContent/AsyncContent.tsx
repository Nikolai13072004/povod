import type { PropsWithChildren, ReactNode } from "react";
import styled from "@emotion/styled";
import { Spinner, VisuallyHidden } from "@vkontakte/vkui";
// Общий Button, а не сырой VKUI: стиль кнопок приложения живёт в одном месте,
// и CTA пустых состояний выглядит так же, как кнопки на остальных экранах.
import { Button } from "../Button/Button";

const StateContainer = styled.div<{ $compact: boolean }>`
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: ${({ $compact }) => ($compact ? "24px 12px" : "48px 16px")};
  color: var(--vkui--color_text_secondary);
  text-align: center;
`;

const StateTitle = styled.div`
  color: var(--vkui--color_text_primary);
  font-size: 16px;
  font-weight: 600;
`;

const StateDescription = styled.div`
  max-width: 420px;
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  min-width: 0;
`;

/** Выход из пустого состояния: что человек может сделать прямо сейчас (UX-010). */
export interface EmptyAction {
  label: string;
  onClick: () => void;
  /** `primary` — основной путь, `secondary` — запасной. */
  mode?: "primary" | "secondary";
}

/** Кнопки в ряд, но с переносом: на узком экране две подписи не помещаются. */
const EmptyActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding-top: 4px;
`;

interface AsyncContentProps {
  loading: boolean;
  error?: string | null;
  empty: boolean;
  loadingTitle?: string;
  errorTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * Действия в пустом состоянии. Пустой экран без выхода — тупик: человек
   * видит «ничего нет» и сам догадывается, что фильтры можно сбросить, а повод
   * создать.
   */
  emptyActions?: EmptyAction[];
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  loadingIndicator?: ReactNode;
  /**
   * Скелетон вместо спиннера (FE-015). Занимает всю ширину и повторяет будущую
   * разметку, поэтому подпись «Загружаем…» рядом не рисуется — она остаётся
   * только для скринридеров.
   */
  skeleton?: ReactNode;
}

/**
 * Единая граница серверного контента.
 * Приоритет состояний: первая загрузка → ошибка → пустой результат → данные.
 */
export function AsyncContent({
  loading,
  error,
  empty,
  loadingTitle = "Загружаем данные…",
  errorTitle = "Не удалось загрузить данные",
  emptyTitle = "Нет данных",
  emptyDescription,
  emptyActions,
  onRetry,
  retryLabel = "Повторить",
  compact = false,
  loadingIndicator,
  skeleton,
  children,
}: PropsWithChildren<AsyncContentProps>) {
  if (loading && skeleton) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <VisuallyHidden>{loadingTitle}</VisuallyHidden>
        {skeleton}
      </div>
    );
  }

  if (loading) {
    return (
      <StateContainer $compact={compact} role="status" aria-live="polite">
        {loadingIndicator ?? <Spinner size="l" />}
        <StateDescription>{loadingTitle}</StateDescription>
      </StateContainer>
    );
  }

  if (error) {
    return (
      <StateContainer $compact={compact} role="alert">
        <StateTitle>{errorTitle}</StateTitle>
        <StateDescription>{error}</StateDescription>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </StateContainer>
    );
  }

  if (empty) {
    return (
      <StateContainer $compact={compact} role="status">
        <StateTitle>{emptyTitle}</StateTitle>
        {emptyDescription && <StateDescription>{emptyDescription}</StateDescription>}
        {emptyActions && emptyActions.length > 0 && (
          <EmptyActions>
            {emptyActions.map((action) => (
              <Button
                key={action.label}
                variant={action.mode ?? "secondary"}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </EmptyActions>
        )}
      </StateContainer>
    );
  }

  return <>{children}</>;
}
