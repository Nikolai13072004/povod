import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { notificationsStore } from "../../stores/notificationsStore";
import { AsyncContent } from "../AsyncContent/AsyncContent";
import { formatNotification, relativeTime } from "./notificationText";
import type { Notification } from "../../services/api";

const Container = styled.div`
  background-color: var(--povod-bg);
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px;
  /* Полоса подтверждения удаления шире обычных действий — на узком экране ей
     нужно право переноситься под заголовок, а не выдавливать его. */
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--povod-text);
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TextButton = styled.button`
  background: none;
  border: none;
  padding: 8px;
  min-height: 40px;
  font-size: 14px;
  color: var(--povod-primary);
  cursor: pointer;

  &:disabled {
    color: var(--povod-text-secondary);
    cursor: default;
  }
`;

/**
 * «Очистить всё» — намеренно НЕ обычная кнопка: обведена красным и с корзиной,
 * чтобы с одного взгляда читалась как удаление, а не как ещё одно безобидное
 * действие рядом с «Прочитать все». Удаление необратимо, поэтому за ней —
 * подтверждение (UX-019).
 */
const ClearAllButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  min-height: 40px;
  font-size: 14px;
  font-weight: 600;
  color: var(--povod-danger);
  background: transparent;
  border: 1px solid var(--povod-danger);
  border-radius: var(--povod-radius-sm);
  cursor: pointer;

  &:hover {
    /* Лёгкая красная заливка на наведении — подтверждает «опасное» действие. */
    background: color-mix(in srgb, var(--povod-danger) 12%, transparent);
  }

  &:disabled {
    color: var(--povod-text-secondary);
    border-color: var(--povod-border);
    cursor: default;
    background: transparent;
  }
`;

/** Полоса подтверждения удаления: появляется вместо действий, пока не решишь. */
const ConfirmBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ConfirmText = styled.span`
  font-size: 14px;
  color: var(--povod-text);
  margin-right: 4px;
`;

const DangerButton = styled.button`
  padding: 8px 14px;
  min-height: 40px;
  font-size: 14px;
  font-weight: 600;
  color: var(--povod-on-primary);
  background: var(--povod-danger);
  border: none;
  border-radius: var(--povod-radius-sm);
  cursor: pointer;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: var(--povod-primary);
  display: flex;
  align-items: center;
  min-width: 40px;
  min-height: 40px;
  justify-content: center;
`;

const Content = styled.div`
  padding: 0 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

/**
 * Непрочитанное отмечается полосой слева, а не цветным фоном: фон пришлось бы
 * подбирать отдельно под тёмную тему и он конфликтует с контрастом текста.
 */
const Card = styled.button<{ $unread: boolean; $clickable: boolean }>`
  width: 100%;
  text-align: left;
  background: var(--povod-surface);
  border: none;
  border-left: 3px solid ${(props) => (props.$unread ? "var(--povod-primary)" : "transparent")};
  border-radius: var(--povod-radius-md);
  padding: 14px 16px;
  box-shadow: var(--povod-shadow-card);
  cursor: ${(props) => (props.$clickable ? "pointer" : "default")};
  display: flex;
  flex-direction: column;
  gap: 6px;
  font: inherit;
  color: inherit;
`;

const Text = styled.span`
  font-size: 15px;
  line-height: 1.4;
  color: var(--povod-text);
  overflow-wrap: anywhere;
`;

const Meta = styled.time`
  font-size: 13px;
  color: var(--povod-text-secondary);
`;

export const NotificationsPage = observer(() => {
  const navigate = useNavigate();
  const { items, unread, isLoading, error } = notificationsStore;
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    void notificationsStore.load();
  }, []);

  /** Куда ведёт уведомление; `undefined` — открывать нечего. */
  const targetOf = (notification: Notification): string | undefined => {
    // У сообщения нет события: адресом служит собеседник.
    if (notification.type === "direct_message") {
      return notification.actorId ? `/chats/${notification.actorId}` : undefined;
    }
    // У заявки — тоже человек, но вести надо на его профиль: там кнопка ответа.
    if (notification.type === "friend_request" || notification.type === "friend_accepted") {
      return notification.actorId ? `/users/${notification.actorId}` : undefined;
    }
    // Приглашение в чат ведёт прямо в чат события, а не на его страницу (PROD-013).
    if (notification.type === "event_chat") {
      return notification.eventId ? `/chats/event/${notification.eventId}` : undefined;
    }
    // Отменённое событие открывать негде — ссылки на него больше не существует.
    return notification.eventId ? `/page-1/${notification.eventId}` : undefined;
  };

  const open = (notification: Notification) => {
    // Клик — это прочтение: гасим уведомление и уменьшаем счётчик, не дожидаясь
    // «Прочитать все». Работает и у уведомлений без перехода (заявка отклонена).
    void notificationsStore.markOneRead(notification.id);
    const target = targetOf(notification);
    if (target) navigate(target);
  };

  return (
    <Container>
      <Header>
        <Title>Уведомления</Title>
        <HeaderActions>
          {confirmingClear ? (
            <ConfirmBar>
              <ConfirmText>Удалить все уведомления?</ConfirmText>
              <DangerButton
                type="button"
                onClick={() => {
                  void notificationsStore.clearAll();
                  setConfirmingClear(false);
                }}
              >
                Удалить всё
              </DangerButton>
              <TextButton type="button" onClick={() => setConfirmingClear(false)}>
                Отмена
              </TextButton>
            </ConfirmBar>
          ) : (
            <>
              <TextButton
                type="button"
                disabled={unread === 0}
                onClick={() => void notificationsStore.markAllRead()}
              >
                Прочитать все
              </TextButton>
              <ClearAllButton
                type="button"
                disabled={items.length === 0}
                onClick={() => setConfirmingClear(true)}
                aria-label="Очистить все уведомления"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                </svg>
                Очистить
              </ClearAllButton>
            </>
          )}
          <CloseButton onClick={() => navigate(-1)} aria-label="Закрыть">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </CloseButton>
        </HeaderActions>
      </Header>

      <Content>
        <AsyncContent
          loading={isLoading && items.length === 0}
          error={error}
          empty={items.length === 0}
          loadingTitle="Загружаем уведомления…"
          errorTitle="Не удалось загрузить уведомления"
          emptyTitle="Пока тихо"
          emptyDescription="Здесь появятся комментарии и новые участники ваших событий, а также изменения в тех, куда вы записаны."
          emptyActions={[
            // Уведомления появляются только после участия — из пустого экрана
            // ведёт ровно один осмысленный путь.
            { label: "Открыть ленту", onClick: () => navigate("/page-1"), mode: "primary" },
          ]}
          onRetry={() => void notificationsStore.load()}
        >
          {items.map((notification) => (
            <Card
              key={notification.id}
              type="button"
              $unread={!notification.readAt}
              $clickable={Boolean(targetOf(notification))}
              onClick={() => open(notification)}
            >
              <Text>{formatNotification(notification)}</Text>
              <Meta dateTime={notification.createdAt}>{relativeTime(notification.createdAt)}</Meta>
            </Card>
          ))}
        </AsyncContent>
      </Content>
    </Container>
  );
});
