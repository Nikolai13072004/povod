import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import styled from "@emotion/styled";
import { Avatar, Button, Group, Spinner } from "@vkontakte/vkui";
import { Icon24Send, Icon28ChevronBack } from "@vkontakte/icons";
import { chatStore } from "../../stores/chatStore";
import { sessionStore } from "../../stores/sessionStore";
import { AsyncContent } from "../../components/AsyncContent/AsyncContent";
import { MessageThreadSkeleton } from "../../components/Skeleton";
import { dayLabel, timeShort } from "../../components/Notification/notificationText";
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
   * Занимает всю оставшуюся высоту через flex, а не через 100dvh.
   *
   * Раньше высота считалась как «весь экран минус нижняя панель», но сам экран
   * начинается ПОД шапкой, которую этот расчёт не вычитал: низ уезжал за край, и
   * поле ввода оказывалось за пределами окна — на десктопе особенно заметно.
   * Теперь высоту задаёт flex-цепочка от оболочки (App.tsx, isChatThread), и
   * шапка учтена сама собой.
   */
  flex: 1;
  min-height: 0;
`;

const PeerBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--povod-border);
  flex-shrink: 0;
  background: var(--povod-surface);
  /* Мягкая тень отделяет шапку от ленты, когда под ней прокручиваются пузыри. */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  z-index: 1;
`;

const PeerName = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--povod-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/* Иконка вместо текстового «←»: у глифа была крошечная зона нажатия. */
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

/**
 * Перевёрнутая лента: свежие внизу, прокрутка держится у низа сама.
 * Интервалы задаются отступами пузырей, а не gap: внутри серии сообщений
 * одного человека зазор маленький, между сериями и днями — больше.
 */
const Feed = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column-reverse;
  padding: 16px;
`;

/** Заголовок дня. Без него длинная переписка сливается в один столбец. */
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

/**
 * Пузырь. Подряд идущие сообщения одного человека собираются в серию: зазор
 * внутри серии меньше, «хвост» (срезанный нижний угол со стороны автора) — у
 * последнего в серии. Направление читается формой, а не только цветом.
 *
 * Кнопки правки на десктопе прячутся до наведения (`.bubble-actions`): постоянно
 * видимые «Изменить/Удалить» под каждой репликой засоряли ленту. На тач-экране
 * hover нет — там они остаются видимыми, как раньше.
 */
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
  /* Токен, а не #fff: в тёмной теме on-primary тёмный — как на кнопках. */
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

/* Прочитанное ярче отправленного: цветом играть нельзя (зелёный на синем фоне
   пузыря не читается ни в одной теме), поэтому различие — насыщенностью. */
const ReadMark = styled.span<{ $read: boolean }>`
  opacity: ${({ $read }) => ($read ? 1 : 0.55)};
  font-weight: ${({ $read }) => ($read ? 600 : 400)};
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

/* Круглая иконка-отправка: широкая текстовая кнопка съедала место у поля. */
const SendButton = styled(Button)`
  width: 44px;
  height: 44px;
  min-width: 44px;
  padding: 0;
  border-radius: 50%;
  align-self: flex-end;
  flex-shrink: 0;
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
          <Icon28ChevronBack />
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
          emptyTitle={
            thread.peer ? `Это начало переписки с ${thread.peer.name}` : "Сообщений пока нет"
          }
          emptyDescription={
            thread.canSend ? "Напишите первым." : "Писать этому человеку сейчас нельзя."
          }
          compact
        >
          {thread.messages.map((message, index) => {
            /*
             * Лента в DOM идёт от свежих к старым (column-reverse), поэтому:
             *  - сосед `index - 1` НОВЕЕ, сосед `index + 1` СТАРЕЕ;
             *  - конец серии (визуально нижний пузырь, с «хвостом») — там, где
             *    следующее по времени сообщение уже другого автора или дня;
             *  - разделитель дня ставится в DOM ПОСЛЕ самого старого сообщения
             *    дня — визуально он оказывается НАД этим днём.
             */
            const newer = index > 0 ? thread.messages[index - 1] : undefined;
            const older =
              index < thread.messages.length - 1 ? thread.messages[index + 1] : undefined;
            const sameDayAsNewer =
              !!newer && dayLabel(newer.createdAt) === dayLabel(message.createdAt);
            const sameDayAsOlder =
              !!older && dayLabel(older.createdAt) === dayLabel(message.createdAt);
            const seriesEnd = !newer || newer.senderId !== message.senderId || !sameDayAsNewer;
            const seriesStart = !older || older.senderId !== message.senderId || !sameDayAsOlder;
            // У самой старой загруженной страницы день может продолжаться выше —
            // после «Показать раньше» разделитель пересчитается и переедет.
            const showDayDivider = !older || !sameDayAsOlder;

            return (
              <Fragment key={message.id}>
                <MessageBubble
                  message={message}
                  mine={message.senderId === myId}
                  tail={seriesEnd}
                  seriesStart={seriesStart}
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
                {showDayDivider && <DayDivider>{dayLabel(message.createdAt)}</DayDivider>}
              </Fragment>
            );
          })}
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
          <SendButton
            type="submit"
            mode="primary"
            loading={thread.sending}
            disabled={!draft.trim() || thread.sending}
            aria-label="Отправить"
          >
            <Icon24Send />
          </SendButton>
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
  /** Последний в серии сообщений автора — у него «хвост» пузыря. */
  tail: boolean;
  /** Первый в серии — перед ним зазор больше, чем внутри серии. */
  seriesStart: boolean;
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
  tail,
  seriesStart,
  editing,
  editDraft,
  onEditDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: BubbleProps) {
  return (
    <Bubble $mine={mine} $tail={tail} $seriesStart={seriesStart}>
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
            {/* Точное «14:23», а не «2 минуты назад»: давность видна по
                разделителю дня, а внутри дня важен момент. */}
            <time dateTime={message.createdAt}>{timeShort(message.createdAt)}</time>
            {mine && (
              <ReadMark
                $read={!!message.readAt}
                aria-label={message.readAt ? "Прочитано" : "Отправлено"}
              >
                {message.readAt ? "✓✓" : "✓"}
              </ReadMark>
            )}
          </BubbleMeta>
          {mine && (
            <BubbleActions className="bubble-actions">
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
