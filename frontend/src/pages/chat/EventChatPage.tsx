import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import styled from "@emotion/styled";
import { Button, Group, Spinner } from "@vkontakte/vkui";
import { Icon24Send, Icon28ChevronBack } from "@vkontakte/icons";
import { eventChatStore } from "../../stores/eventChatStore";
import { sessionStore } from "../../stores/sessionStore";
import { eventsAPI, type EventMessage } from "../../services/api";
import { AsyncContent } from "../../components/AsyncContent/AsyncContent";
import { MessageThreadSkeleton } from "../../components/Skeleton";
import { dayLabel, timeShort } from "../../components/Notification/notificationText";
import { useToast } from "../../components/Toast/ToastProvider";

/**
 * Чат участников события (PROD-013).
 *
 * Устроен как личная переписка (`ChatThreadPage`), но групповой: у чужих реплик
 * подписано имя автора (в личке собеседник один — там имя лишнее). Порядок,
 * перевёрнутая лента и группировка серий — те же.
 */

const Screen = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--povod-border);
  flex-shrink: 0;
  background: var(--povod-surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  z-index: 1;

  /* На десктопе — лёгкая шапка без залитого бара (как у страниц). */
  @media (min-width: 900px) {
    background: transparent;
    box-shadow: none;
  }
`;

const TitleBox = styled.button`
  border: none;
  background: transparent;
  padding: 0;
  min-width: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
`;

const RoomTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--povod-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RoomHint = styled.div`
  font-size: 12px;
  color: var(--povod-text-secondary);
`;

const BackButton = styled.button`
  border: none;
  background: transparent;
  color: var(--povod-text-secondary);
  cursor: pointer;
  width: 40px;
  height: 40px;
  margin-left: -8px;
  display: grid;
  place-items: center;
  border-radius: var(--povod-radius-sm);

  &:hover {
    color: var(--povod-primary);
    background: var(--povod-surface-muted);
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
  }
`;

const Feed = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column-reverse;
  padding: 16px;
`;

const DayDivider = styled.div`
  align-self: center;
  margin: 14px 0 8px;
  padding: 3px 12px;
  border-radius: 999px;
  background: var(--povod-surface-muted);
  color: var(--povod-text-secondary);
  font-size: 12px;
  font-weight: 600;
`;

const Bubble = styled.div<{ $mine: boolean; $tail: boolean; $seriesStart: boolean }>`
  align-self: ${({ $mine }) => ($mine ? "flex-end" : "flex-start")};
  max-width: min(78%, 520px);
  padding: 8px 12px;
  margin-top: ${({ $seriesStart }) => ($seriesStart ? "10px" : "3px")};
  border-radius: ${({ $mine, $tail }) =>
    $tail
      ? $mine
        ? "var(--povod-radius-md) var(--povod-radius-md) var(--povod-radius-xs) var(--povod-radius-md)"
        : "var(--povod-radius-md) var(--povod-radius-md) var(--povod-radius-md) var(--povod-radius-xs)"
      : "var(--povod-radius-md)"};
  background: ${({ $mine }) => ($mine ? "var(--povod-primary)" : "var(--povod-surface-muted)")};
  color: ${({ $mine }) => ($mine ? "var(--povod-on-primary)" : "var(--povod-text)")};
  overflow-wrap: anywhere;

  @media (hover: hover) and (pointer: fine) {
    .bubble-actions {
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    &:hover .bubble-actions,
    &:focus-within .bubble-actions {
      opacity: 1;
    }
  }
`;

/** Имя автора над первой репликой серии — только у чужих: свои и так справа. */
const SenderName = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: var(--povod-primary);
  margin-bottom: 2px;
`;

const BubbleText = styled.div`
  font-size: 15px;
  line-height: 1.35;
  white-space: pre-wrap;
`;

const BubbleMeta = styled.div<{ $mine: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 4px;
  font-size: 11px;
  opacity: ${({ $mine }) => ($mine ? 0.85 : 0.7)};
`;

const BubbleActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 6px;
`;

const MiniButton = styled.button`
  border: none;
  background: transparent;
  padding: 0;
  font-size: 11px;
  text-decoration: underline;
  color: inherit;
  cursor: pointer;
  opacity: 0.85;

  &:focus-visible {
    outline: 1px solid currentColor;
  }
`;

const Composer = styled.form`
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--povod-border);
  flex-shrink: 0;
  background: var(--povod-surface);
`;

const Input = styled.textarea`
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  resize: none;
  padding: 9px 12px;
  border-radius: var(--povod-radius-sm);
  border: 1px solid var(--povod-border-strong);
  background: var(--povod-surface);
  color: var(--povod-text);
  font: inherit;
  font-size: 15px;

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: -1px;
  }
`;

const SendButton = styled(Button)`
  width: 44px;
  height: 44px;
  min-width: 44px;
  padding: 0;
  border-radius: 50%;
  align-self: flex-end;
  flex-shrink: 0;
`;

const LoadMore = styled.div`
  display: grid;
  place-items: center;
  padding: 8px;
`;

export const EventChatPage = observer(() => {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();
  const [draft, setDraft] = useState("");
  // authorId события нужен, чтобы показать модерацию (удаление чужой реплики
  // автору). Грузится отдельно — страница чата его не отдаёт.
  const [eventAuthorId, setEventAuthorId] = useState<string | null>(null);

  const room = eventChatStore.room(eventId);
  const myId = sessionStore.user.id;

  useEffect(() => {
    if (!eventId) return;
    void eventChatStore.load(eventId);
    eventChatStore.startPolling(eventId);
    void eventsAPI.getById(eventId).then((response) => {
      if (response.data) setEventAuthorId(response.data.authorId);
    });
    return () => eventChatStore.stopPolling();
  }, [eventId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Поле очищаем сразу; при отказе — возвращаем текст (как в личке).
    setDraft("");
    const sent = await eventChatStore.send(eventId, text);
    if (!sent) {
      setDraft(text);
      showToast(room.sendError ?? "Не удалось отправить сообщение", { type: "error" });
    }
  };

  const canModerate = (message: EventMessage) =>
    message.senderId === myId || eventAuthorId === myId;

  if (room.notFound) {
    return (
      <Group mode="plain">
        <AsyncContent
          loading={false}
          empty
          emptyTitle="Чат недоступен"
          emptyDescription="Чат открыт участникам события. Запишитесь на него, чтобы писать."
          emptyActions={[{ label: "К чатам", onClick: () => navigate("/chats"), mode: "primary" }]}
        >
          {null}
        </AsyncContent>
      </Group>
    );
  }

  return (
    <Screen>
      <TopBar>
        <BackButton type="button" onClick={() => navigate("/chats")} aria-label="К чатам">
          <Icon28ChevronBack />
        </BackButton>
        <TitleBox type="button" onClick={() => navigate(`/page-1/${eventId}`)}>
          <RoomTitle>{room.eventTitle || "Чат события"}</RoomTitle>
          <RoomHint>Чат участников · нажмите, чтобы открыть событие</RoomHint>
        </TitleBox>
      </TopBar>

      <Feed>
        <AsyncContent
          loading={room.loading && room.messages.length === 0}
          skeleton={<MessageThreadSkeleton />}
          loadingTitle="Загружаем чат…"
          error={room.error}
          onRetry={() => void eventChatStore.load(eventId, true)}
          empty={room.messages.length === 0}
          emptyTitle="Пока тихо"
          emptyDescription="Напишите первым — тут договариваются перед встречей."
          compact
        >
          {room.messages.map((message, index) => {
            // Лента в DOM от свежих к старым (column-reverse): index-1 новее.
            const newer = index > 0 ? room.messages[index - 1] : undefined;
            const older = index < room.messages.length - 1 ? room.messages[index + 1] : undefined;
            const sameDayAsNewer =
              !!newer && dayLabel(newer.createdAt) === dayLabel(message.createdAt);
            const sameDayAsOlder =
              !!older && dayLabel(older.createdAt) === dayLabel(message.createdAt);
            const sameSenderAsNewer = !!newer && newer.senderId === message.senderId;
            const sameSenderAsOlder = !!older && older.senderId === message.senderId;
            const seriesEnd = !sameSenderAsNewer || !sameDayAsNewer;
            const seriesStart = !sameSenderAsOlder || !sameDayAsOlder;
            const showDayDivider = !older || !sameDayAsOlder;
            const mine = message.senderId === myId;

            return (
              <Fragment key={message.id}>
                <Bubble $mine={mine} $tail={seriesEnd} $seriesStart={seriesStart}>
                  {/* Имя — только у чужих и только в начале серии. */}
                  {!mine && seriesStart && <SenderName>{message.senderName}</SenderName>}
                  <BubbleText>{message.text}</BubbleText>
                  <BubbleMeta $mine={mine}>
                    <time dateTime={message.createdAt}>{timeShort(message.createdAt)}</time>
                  </BubbleMeta>
                  {canModerate(message) && (
                    <BubbleActions className="bubble-actions">
                      <MiniButton
                        type="button"
                        onClick={async () => {
                          const removed = await eventChatStore.remove(eventId, message.id);
                          if (!removed) showToast("Не удалось удалить", { type: "error" });
                        }}
                      >
                        Удалить
                      </MiniButton>
                    </BubbleActions>
                  )}
                </Bubble>
                {showDayDivider && <DayDivider>{dayLabel(message.createdAt)}</DayDivider>}
              </Fragment>
            );
          })}
        </AsyncContent>

        {room.nextCursor && (
          <LoadMore>
            {room.loadingMore ? (
              <Spinner size="s" />
            ) : (
              <Button
                mode="tertiary"
                size="s"
                onClick={() => void eventChatStore.loadOlder(eventId)}
              >
                Показать раньше
              </Button>
            )}
          </LoadMore>
        )}
      </Feed>

      <Composer onSubmit={submit}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit(event);
            }
          }}
          placeholder="Написать в чат события…"
          aria-label="Текст сообщения"
          rows={1}
        />
        <SendButton
          type="submit"
          mode="primary"
          loading={room.sending}
          disabled={!draft.trim() || room.sending}
          aria-label="Отправить"
        >
          <Icon24Send />
        </SendButton>
      </Composer>
    </Screen>
  );
});

export default EventChatPage;
