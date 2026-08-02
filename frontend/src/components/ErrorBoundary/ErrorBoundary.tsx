import { Component, type ErrorInfo, type ReactNode } from "react";
import styled from "@emotion/styled";

const Screen = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 20px;
  text-align: center;
  background: var(--vkui--color_background, var(--povod-bg));
  color: var(--vkui--color_text_primary, var(--povod-text));
  box-sizing: border-box;
`;

const Emoji = styled.div`
  font-size: 44px;
  line-height: 1;
`;

const Title = styled.h1`
  font-size: clamp(20px, 5vw, 26px);
  font-weight: 700;
  margin: 0;
`;

const Description = styled.p`
  max-width: 420px;
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--vkui--color_text_secondary, var(--povod-text-secondary));
  overflow-wrap: anywhere;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-top: 8px;
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  min-height: 44px;
  padding: 12px 20px;
  border-radius: var(--povod-radius-md);
  border: 1px solid var(--povod-primary);
  background: ${(props) => (props.$primary ? "var(--povod-primary)" : "transparent")};
  color: ${(props) => (props.$primary ? "var(--povod-on-primary)" : "var(--povod-primary)")};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &:active {
    opacity: 0.85;
  }
`;

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Необязательный кастомный fallback; получает ошибку и функцию сброса. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Ловит ошибки рендера ниже по дереву и показывает понятный экран восстановления
 * вместо белого экрана (FE-003). Ошибки рендера в React всплывают только до
 * ближайшего class-компонента с `getDerivedStateFromError`/`componentDidCatch`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Локальный лог для диагностики; серверная агрегация ошибок — отдельная задача (OPS-008/009).
    console.error("[ErrorBoundary] перехвачена ошибка рендера:", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <Screen role="alert">
        <Emoji aria-hidden="true">😔</Emoji>
        <Title>Что-то пошло не так</Title>
        <Description>
          Произошла непредвиденная ошибка. Попробуйте вернуться к экрану или обновить страницу —
          ваши данные не потеряны.
        </Description>
        <Actions>
          <ActionButton $primary type="button" onClick={this.reset}>
            Попробовать снова
          </ActionButton>
          <ActionButton type="button" onClick={this.reload}>
            Обновить страницу
          </ActionButton>
        </Actions>
      </Screen>
    );
  }
}
