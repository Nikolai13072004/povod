import type { PropsWithChildren, ReactNode } from "react";
import styled from "@emotion/styled";
import { Button, Spinner } from "@vkontakte/vkui";

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

interface AsyncContentProps {
  loading: boolean;
  error?: string | null;
  empty: boolean;
  loadingTitle?: string;
  errorTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  loadingIndicator?: ReactNode;
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
  onRetry,
  retryLabel = "Повторить",
  compact = false,
  loadingIndicator,
  children,
}: PropsWithChildren<AsyncContentProps>) {
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
          <Button mode="secondary" onClick={onRetry}>
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
      </StateContainer>
    );
  }

  return <>{children}</>;
}
