import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import styled from "@emotion/styled";
import { Avatar, Group, Search } from "@vkontakte/vkui";
import { chatStore } from "../../stores/chatStore";
import { AsyncContent } from "../../components/AsyncContent/AsyncContent";
import { DialogListSkeleton } from "../../components/Skeleton";
import { relativeTime } from "../../components/Notification/notificationText";
import type { Dialog } from "../../services/api";

/**
 * Список переписок (PROD-011).
 *
 * До этого вкладка была заглушкой с текстом «функция скоро будет доступна»: ни
 * данных, ни списка. Здесь она становится настоящей.
 *
 * Поиск фильтрует локально: диалогов не больше пятидесяти, ходить за этим на
 * сервер незачем. Строка поиска живёт в сторе, а не в компоненте, — уход на
 * другую вкладку не должен её терять.
 */

const Row = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;

  &:hover {
    background: var(--povod-surface-muted);
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: -2px;
  }
`;

const Info = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Name = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--povod-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Preview = styled.div<{ $unread: boolean }>`
  font-size: 14px;
  color: ${({ $unread }) => ($unread ? "var(--povod-text)" : "var(--povod-text-secondary)")};
  font-weight: ${({ $unread }) => ($unread ? 600 : 400)};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Side = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
`;

const Time = styled.time`
  font-size: 12px;
  color: var(--povod-text-secondary);
  white-space: nowrap;
`;

const Badge = styled.span`
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--povod-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: grid;
  place-items: center;
`;

export const ChatList = observer(() => {
  const navigate = useNavigate();
  const dialogs = chatStore.visibleDialogs;
  const searching = chatStore.search.trim().length > 0;

  useEffect(() => {
    /*
     * Каждый заход — заново, и дальше по таймеру.
     *
     * Без `force` стор возвращался по `dialogsLoaded` и список замирал на всю
     * сессию: пока человек ходил по приложению, значок в шапке рос, а сам
     * список новой переписки не показывал. Опроса у него тоже не было —
     * `startThreadPolling` работает только на открытой переписке, а счётчик
     * тянет одно число.
     */
    void chatStore.loadDialogs(true);
    chatStore.startDialogsPolling();
    return () => chatStore.stopDialogsPolling();
  }, []);

  return (
    <Group mode="plain">
      <Search
        value={chatStore.search}
        onChange={(event) => chatStore.setSearch(event.target.value)}
        placeholder="Поиск по имени"
        aria-label="Поиск по перепискам"
      />
      <AsyncContent
        loading={chatStore.dialogsLoading && chatStore.dialogs.length === 0}
        skeleton={<DialogListSkeleton />}
        loadingTitle="Загружаем переписки…"
        error={chatStore.dialogsError}
        onRetry={() => void chatStore.loadDialogs(true)}
        empty={dialogs.length === 0}
        emptyTitle={searching ? "Ничего не найдено" : "Переписок пока нет"}
        emptyDescription={
          searching
            ? "Попробуйте другое имя."
            : "Писать можно тем, кто принял вашу заявку в друзья. Так переписку не завалит спамом."
        }
        emptyActions={
          searching
            ? [{ label: "Сбросить поиск", onClick: () => chatStore.setSearch(""), mode: "primary" }]
            : [
                { label: "Мои друзья", onClick: () => navigate("/Profile"), mode: "primary" },
                { label: "Открыть ленту", onClick: () => navigate("/page-1") },
              ]
        }
      >
        {dialogs.map((dialog) => (
          <DialogRow
            key={dialog.peer.id}
            dialog={dialog}
            onOpen={() => navigate(`/chats/${dialog.peer.id}`)}
          />
        ))}
      </AsyncContent>
    </Group>
  );
});

function DialogRow({ dialog, onOpen }: { dialog: Dialog; onOpen: () => void }) {
  const { peer, lastMessage, unread } = dialog;
  // «Вы: » у исходящего — иначе в списке не отличить свою реплику от чужой.
  const outgoing = lastMessage.senderId !== peer.id;
  const preview = outgoing ? `Вы: ${lastMessage.text}` : lastMessage.text;

  return (
    <Row type="button" onClick={onOpen} aria-label={`Переписка с ${peer.name}`}>
      <Avatar size={48} src={peer.avatar} initials={peer.name.slice(0, 1)} />
      <Info>
        <Name>{peer.name}</Name>
        <Preview $unread={unread > 0}>{preview}</Preview>
      </Info>
      <Side>
        <Time dateTime={lastMessage.createdAt}>{relativeTime(lastMessage.createdAt)}</Time>
        {unread > 0 && <Badge aria-label={`${unread} непрочитанных`}>{unread}</Badge>}
      </Side>
    </Row>
  );
}

export default ChatList;
