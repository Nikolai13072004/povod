import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Уведомление о новой версии (PWA-003).
 *
 * Установленное приложение живёт со своей копией кода, пока её не заменят.
 * Обновлять молча посреди сеанса нельзя: перезагрузка страницы теряет то, что
 * человек набирал в форме создания события или в комментарии. Поэтому
 * приложение спрашивает, а обновляется по нажатию.
 */

const Banner = styled.div`
  position: fixed;
  left: 50%;
  bottom: calc(84px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 12px 16px;
  border-radius: var(--povod-radius-md);
  background: var(--povod-surface);
  color: var(--povod-text);
  box-shadow: var(--povod-shadow-card);
  border: 1px solid var(--povod-border-strong);
  font-size: 14px;
  line-height: 1.4;
`;

const Text = styled.span`
  flex-grow: 1;
  min-width: 0;
`;

const Action = styled.button`
  flex-shrink: 0;
  border: none;
  border-radius: var(--povod-radius-sm);
  padding: 8px 14px;
  min-height: 40px;
  background: var(--povod-primary);
  color: var(--povod-on-primary);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
`;

const Dismiss = styled.button`
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 8px;
  min-height: 40px;
  color: var(--povod-text-secondary);
  font: inherit;
  cursor: pointer;
`;

/** Раз в час: чаще незачем, реже — и обновление можно не увидеть неделями. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function AppUpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Браузер сам проверяет обновление только при навигации; в установленном
      // приложении её может не быть сутками.
      const timer = window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
      return () => window.clearInterval(timer);
    },
  });

  // Новая версия после отказа не должна молчать вечно: следующая её предложит.
  useEffect(() => {
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  if (!needRefresh || dismissed) return null;

  return (
    <Banner role="status" aria-live="polite">
      <Text>Доступна новая версия приложения.</Text>
      <Action type="button" onClick={() => void updateServiceWorker(true)}>
        Обновить
      </Action>
      <Dismiss type="button" onClick={() => setDismissed(true)}>
        Позже
      </Dismiss>
    </Banner>
  );
}
