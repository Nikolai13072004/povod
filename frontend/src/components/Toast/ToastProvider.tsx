import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import styled from "@emotion/styled";

export type ToastType = "success" | "error" | "info";

interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

export interface ToastOptions {
  type?: ToastType;
  /** Автоскрытие, мс. По умолчанию 3500. */
  duration?: number;
}

type ShowToast = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ShowToast | null>(null);

const Viewport = styled.div`
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 3000;
  width: min(92vw, 420px);
  display: flex;
  justify-content: center;
  pointer-events: none;
`;

const ToastCard = styled.div<{ $type: ToastType }>`
  pointer-events: auto;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border-radius: var(--povod-radius-md);
  color: var(--povod-on-primary);
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  cursor: pointer;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  white-space: pre-line;
  background: ${({ $type }) =>
    $type === "error"
      ? "var(--povod-danger)"
      : $type === "success"
        ? "var(--povod-success)"
        : "var(--povod-primary)"};
  animation: povod-toast-in 0.2s ease-out;

  @keyframes povod-toast-in {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

/**
 * Глобальные toast-уведомления (FE-004): заменяют блокирующий `alert()`.
 * Показывает одно сообщение снизу по центру, автоскрытие по таймеру или по клику.
 */
export function ToastProvider({ children }: PropsWithChildren): ReactNode {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const counterRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showToast = useCallback<ShowToast>(
    (message, options = {}) => {
      clearTimer();
      counterRef.current += 1;
      setToast({ id: counterRef.current, message, type: options.type ?? "info" });
      timerRef.current = window.setTimeout(() => setToast(null), options.duration ?? 3500);
    },
    [clearTimer],
  );

  const value = useMemo(() => showToast, [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Viewport>
          <ToastCard
            key={toast.id}
            $type={toast.type}
            role={toast.type === "error" ? "alert" : "status"}
            aria-live={toast.type === "error" ? "assertive" : "polite"}
            onClick={dismiss}
          >
            {toast.message}
          </ToastCard>
        </Viewport>
      )}
    </ToastContext.Provider>
  );
}

/** Возвращает функцию показа toast. Должен вызываться внутри `<ToastProvider>`. */
export function useToast(): ShowToast {
  const showToast = useContext(ToastContext);
  if (!showToast) {
    throw new Error("useToast должен использоваться внутри <ToastProvider>");
  }
  return showToast;
}
