import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import styled from "@emotion/styled";
import { Avatar, Button, Group, Spinner } from "@vkontakte/vkui";
import { chatStore } from "../../stores/chatStore";
import { sessionStore } from "../../stores/sessionStore";
import { AsyncContent } from "../../components/AsyncContent/AsyncContent";
import { MessageThreadSkeleton } from "../../components/Skeleton";
import { relativeTime } from "../../components/Notification/notificationText";
import { useToast } from "../../components/Toast/ToastProvider";
import type { DirectMessage } from "../../services/api";

/**
 * Переписка с одним человеком (PROD-011).
 *
 * Лента сообщений перевёрнута через `column-reverse`. Сервер отдаёт свежие
 * первыми, а показать их надо снизу — и это не только про порядок: в
 * перевёрнутом контейнере браузер сам держит прокрутку у низа, а подгрузка
 * истории наверх не сдвигает то, что человек читает. Считать и восстанавливать
 * `scrollTop` руками при каждой странице пришлось бы иначе.
 */

const Screen = styled.div`
  display: flex;
  flex-direction: column;
  /*
   * Высота экрана минус место под фиксированную нижнюю навигацию. Без этого
   * поле ввода уезжает под панель: она позиционирована fixed поверх страницы,
   * и на десктопном превью проблема не видна — там панели снизу нет.
   */
  height: calc(100dvh - var(--povod-bottom-nav-offset));
  min-height: 320px;
`;

const PeerBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--povod-border);
  flex-shrink: 0;
`;

const PeerName = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--povod-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const BackButton = styled.button`
  border: none;
  background: transparent;
  color: var(--povod-text-secondary);
  font-size: 15px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--povod-radius-sm);

  &:hover {
    color: var(--povod-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
  }
`;

/** Перевёрнутая лента: свежие внизу, прокрутка держится у низа сама. */
const Feed = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  padding: 16px;
`;

const Bubble = styled.div<{ $mine: boolean }>`
  align-self: ${({ $mine }) => ($mine ? "flex-end" : "flex-start")};
  max-width: min(78%, 520px);
  padding: 8px 12px;
  border-radius: 16px;
  background: ${({ $mine }) => ($mine ? "var(--povod-primary)" : "var(--povod-surface-muted)")};
  color: ${({ $mine }) => ($mine ? "#fff" : "var(--povod-text)")};
  overflow-wrap: anywhere;
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

const Closed = styled.div`
  padding: 16px;
  border-top: 1px solid var(--povod-border);
  text-align: center;
  font-size: 14px;
  color: var(--povod-text-secondary);
  flex-shrink: 0;
`;

const LoadMore = styled.div`
  display: grid;
  place-items: center;
  padding: 8px;
`;

const Editor = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const ChatThreadPage = observer(() => {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const thread = chatStore.thread(userId);
  const myId = sessionStore.user.id;

  useEffect(() => {
    if (!userId) return;
    void chatStore.loadThread(userId).then(() => void chatStore.markRead(userId));
    chatStore.startThreadPolling(userId);
    // Cleanup обязателен и при смене собеседника: `startThreadPolling` вешает не
    // только таймер, но и слушатель `visibilitychange`, и без снятия их
    // накапливается по одному на каждый заход в чат.
    return () => chatStore.stopThreadPolling();
  }, [userId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const sent = await chatStore.send(userId, text);
    if (sent) {
      setDraft("");
      return;
    }
    showToast(chatStore.thread(userId).sendError ?? "Не удалось отправить сообщение", {
      type: "error",
    });
  };

  if (thread.notFound) {
    return (
      <Group mode="plain">
        <AsyncContent
          loading={false}
          empty
          emptyTitle="Переписка недоступна"
          emptyDescription="Писать можно только тем, кто принял вашу заявку в друзья."
          emptyActions={[
            { label: "К перепискам", onClick: () => navigate("/chats"), mode: "primary" },
          ]}
        >
          {null}
        </AsyncContent>
      </Group>
    );
  }

  return (
    <Screen>
      <PeerBar>
        <BackButton type="button" onClick={() => navigate("/chats")} aria-label="К перепискам">
          ←
        </BackButton>
        {thread.peer && (
          <>
            <Avatar size={36} src={thread.peer.avatar} initials={thread.peer.name.slice(0, 1)} />
            <PeerName>{thread.peer.name}</PeerName>
          </>
        )}
      </PeerBar>

      <Feed>
        <AsyncContent
          loading={thread.loading && thread.messages.length === 0}
          skeleton={<MessageThreadSkeleton />}
          loadingTitle="Загружаем переписку…"
          error={thread.error}
          onRetry={() => void chatStore.loadThread(userId, true)}
          empty={thread.messages.length === 0}
          emptyTitle="Сообщений пока нет"
          emptyDescription={
            thread.canSend ? "Напишите первым." : "Писать этому человеку сейчас нельзя."
          }
          compact
        >
          {thread.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mine={message.senderId === myId}
              editing={editingId === message.id}
              editDraft={editDraft}
              onEditDraft={setEditDraft}
              onStartEdit={() => {
                setEditingId(message.id);
                setEditDraft(message.text);
              }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={async () => {
                const saved = await chatStore.edit(userId, message.id, editDraft);
                if (saved) setEditingId(null);
                else showToast("Не удалось изменить сообщение", { type: "error" });
              }}
              onDelete={async () => {
                const removed = await chatStore.remove(userId, message.id);
                if (!removed) showToast("Не удалось удалить сообщение", { type: "error" });
              }}
            />
          ))}
        </AsyncContent>

        {/* Ниже всех в перевёрнутой ленте — то есть визуально выше истории. */}
        {thread.nextCursor && (
          <LoadMore>
            {thread.loadingMore ? (
              <Spinner size="s" />
            ) : (
              <Button mode="tertiary" size="s" onClick={() => void chatStore.loadOlder(userId)}>
                Показать раньше
              </Button>
            )}
          </LoadMore>
        )}
      </Feed>

      {thread.canSend ? (
        <Composer onSubmit={submit}>
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter отправляет, Shift+Enter переносит строку — как в комментариях.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit(event);
              }
            }}
            placeholder="Написать сообщение…"
            aria-label="Текст сообщения"
            rows={1}
          />
          <Button type="submit" loading={thread.sending} disabled={!draft.trim() || thread.sending}>
            Отправить
          </Button>
        </Composer>
      ) : (
        <Closed role="status">
          {thread.loaded
            ? "Писать можно только друзьям. Переписка осталась, а отправка закрыта."
            : "Загружаем…"}
        </Closed>
      )}
    </Screen>
  );
});

interface BubbleProps {
  message: DirectMessage;
  mine: boolean;
  editing: boolean;
  editDraft: string;
  onEditDraft: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}

function MessageBubble({
  message,
  mine,
  editing,
  editDraft,
  onEditDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: BubbleProps) {
  return (
    <Bubble $mine={mine}>
      {editing ? (
        <Editor>
          {/*
            Имя отличается от поля ввода внизу экрана. Одинаковые доступные
            имена у двух разных полей неразличимы на слух: скринридер объявит
            «Текст сообщения» и там, и там.
          */}
          <Input
            value={editDraft}
            onChange={(event) => onEditDraft(event.target.value)}
            aria-label="Изменить сообщение"
            rows={2}
          />
          <BubbleActions>
            <MiniButton type="button" onClick={onSaveEdit}>
              Сохранить
            </MiniButton>
            <MiniButton type="button" onClick={onCancelEdit}>
              Отмена
            </MiniButton>
          </BubbleActions>
        </Editor>
      ) : (
        <>
          <BubbleText>{message.text}</BubbleText>
          <BubbleMeta $mine={mine}>
            {/* Отметка о правке обязательна: иначе переписка молча переписывает себя. */}
            {message.editedAt && <span>изменён</span>}
            <time dateTime={message.createdAt}>{relativeTime(message.createdAt)}</time>
            {mine && (
              <span aria-label={message.readAt ? "Прочитано" : "Отправлено"}>
                {message.readAt ? "✓✓" : "✓"}
              </span>
            )}
          </BubbleMeta>
          {mine && (
            <BubbleActions>
              <MiniButton type="button" onClick={onStartEdit}>
                Изменить
              </MiniButton>
              <MiniButton type="button" onClick={onDelete}>
                Удалить
              </MiniButton>
            </BubbleActions>
          )}
        </>
      )}
    </Bubble>
  );
}

export default ChatThreadPage;
