import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import styled from "@emotion/styled";
import { Avatar, Group, Search } from "@vkontakte/vkui";
import { chatStore } from "../../stores/chatStore";
import { friendsStore } from "../../stores/friendsStore";
import { sessionStore } from "../../stores/sessionStore";
import { AsyncContent } from "../../components/AsyncContent/AsyncContent";
import { DialogListSkeleton } from "../../components/Skeleton";
import { chatTimeShort } from "../../components/Notification/notificationText";
import { eventsAPI, type Dialog, type Event } from "../../services/api";

/**
 * Цвет аватара-заглушки — детерминированно от id человека.
 *
 * Без этого все, у кого нет фото, выглядели одинаковыми серыми кружками, и
 * список читался только по именам. Градиенты берутся из палитры VKUI (1–6);
 * один и тот же человек всегда получает один и тот же цвет.
 */
function avatarGradient(id: string): 1 | 2 | 3 | 4 | 5 | 6 {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % 6;
  return ((hash % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
}

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

const SectionTitle = styled.div`
  padding: 8px 16px 4px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--povod-text-secondary);
`;

const Row = styled.button`
  position: relative;
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

  /* Разделитель-инсет: начинается под текстом, а не под аватаром, — так строки
     не сливаются в покое, но список не выглядит расчерченным в клетку. */
  &::after {
    content: "";
    position: absolute;
    left: 76px;
    right: 0;
    bottom: 0;
    border-bottom: 1px solid var(--povod-border);
  }

  &:last-child::after {
    display: none;
  }

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

/* Непрочитанный диалог выделяется целиком: имя жирнее, время цветом. Раньше
   реагировало только превью, и непрочитанное искалось по одной строке. */
const Name = styled.div<{ $unread?: boolean }>`
  font-size: 16px;
  font-weight: ${({ $unread }) => ($unread ? 700 : 600)};
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

/* Отметка прочтения у своей последней реплики прямо в списке: ✓ отправлено,
   ✓✓ прочитано. Так статус виден с обеих сторон — у входящих непрочитанных
   бейдж справа, у своих исходящих — галочки. Прочитанное ярче, но не цветом:
   зелёный на этой строке спорит с акцентом бейджа. */
const ReadTick = styled.span<{ $read: boolean }>`
  margin-right: 4px;
  font-size: 12px;
  color: ${({ $read }) => ($read ? "var(--povod-primary)" : "var(--povod-text-secondary)")};
`;

/** Подсказка у друга без переписки — это приглашение, а не серый текст. */
const StartHint = styled.div`
  font-size: 14px;
  color: var(--povod-primary);
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

/* Фиксированная минимальная ширина: «14:23» и «Вчера» разной длины, без неё
   правый край списка пляшет от строки к строке. */
const Time = styled.time<{ $unread?: boolean }>`
  min-width: 48px;
  text-align: right;
  font-size: 12px;
  font-weight: ${({ $unread }) => ($unread ? 600 : 400)};
  color: ${({ $unread }) => ($unread ? "var(--povod-primary)" : "var(--povod-text-secondary)")};
  white-space: nowrap;
`;

const Badge = styled.span`
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--povod-primary);
  /* Токен, а не #fff: в тёмной теме on-primary тёмный, и белый терял контраст. */
  color: var(--povod-on-primary);
  font-size: 12px;
  font-weight: 600;
  display: grid;
  place-items: center;
`;

/**
 * Верхняя часть списка переписок на телефоне: поиск отделён от списка тонкой
 * линией снизу. Серую подложку убрали — она делала экран двухцветным; теперь
 * всё на едином `--povod-surface`, а зону поиска от диалогов отбивает только
 * полоска-разделитель. На десктопе оформление не нужно: там узкая колонка.
 */
const SearchBar = styled.div`
  @media (max-width: 899px) {
    border-bottom: 1px solid var(--povod-border);
    padding-bottom: 6px;
    margin-bottom: 4px;
  }
`;

export const ChatList = observer(() => {
  const navigate = useNavigate();
  const dialogs = chatStore.visibleDialogs;
  const searching = chatStore.search.trim().length > 0;
  const myId = sessionStore.user.id;

  /*
   * Чаты событий (PROD-013): события с включённым чатом, где человек автор или
   * участник. Источник — «мои события»: отдельного эндпоинта под список чатов
   * заводить незачем, комната есть у каждого своего события с флагом.
   */
  const [eventChats, setEventChats] = useState<Event[]>([]);
  useEffect(() => {
    let alive = true;
    void eventsAPI.getMine().then((response) => {
      if (!alive || !response.data) return;
      const seen = new Set<string>();
      const withChat = [...response.data.created, ...response.data.attending].filter((event) => {
        if (!event.chatEnabled || seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
      setEventChats(withChat);
    });
    return () => {
      alive = false;
    };
  }, [myId]);
  const eventQuery = chatStore.search.trim().toLocaleLowerCase("ru");
  const visibleEventChats = eventQuery
    ? eventChats.filter((event) => event.title.toLocaleLowerCase("ru").includes(eventQuery))
    : eventChats;

  /*
   * Друзья, которым ещё ни разу не писали.
   *
   * Список диалогов строится ИЗ СООБЩЕНИЙ, поэтому такой друг в него не
   * попадает: экран оказывался пустым, хотя написать было кому, и начать
   * переписку можно было только зайдя в чужой профиль. Подмешивать их в
   * диалоги нельзя — у диалога обязана быть последняя реплика, а её нет.
   */
  const withoutDialog = friendsStore.friends.filter(
    (friend) => !chatStore.dialogs.some((dialog) => dialog.peer.id === friend.id),
  );
  const query = chatStore.search.trim().toLocaleLowerCase("ru");
  const visibleFriends = query
    ? withoutDialog.filter((friend) => friend.name.toLocaleLowerCase("ru").includes(query))
    : withoutDialog;

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

  useEffect(() => {
    if (myId) void friendsStore.load(myId, true);
  }, [myId]);

  return (
    <Group mode="plain">
      <SearchBar>
        <Search
          value={chatStore.search}
          onChange={(event) => chatStore.setSearch(event.target.value)}
          placeholder="Поиск по имени"
          aria-label="Поиск по перепискам"
        />
      </SearchBar>
      <AsyncContent
        loading={chatStore.dialogsLoading && chatStore.dialogs.length === 0}
        skeleton={<DialogListSkeleton />}
        loadingTitle="Загружаем переписки…"
        error={chatStore.dialogsError}
        onRetry={() => void chatStore.loadDialogs(true)}
        empty={
          dialogs.length === 0 && visibleFriends.length === 0 && visibleEventChats.length === 0
        }
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
                // Ведёт к людям, а не в свой профиль: чтобы появилась первая
                // переписка, нужно сначала кого-то найти и подружиться.
                { label: "Найти людей", onClick: () => navigate("/users"), mode: "primary" },
                { label: "Открыть ленту", onClick: () => navigate("/page-1") },
              ]
        }
      >
        {dialogs.length > 0 && visibleFriends.length > 0 && (
          // Заголовок появляется только рядом с секцией «Друзья»: одинокому
          // списку подпись не нужна, а две секции без подписей сливаются.
          <SectionTitle>Переписки</SectionTitle>
        )}
        {dialogs.map((dialog) => (
          <DialogRow
            key={dialog.peer.id}
            dialog={dialog}
            onOpen={() => navigate(`/chats/${dialog.peer.id}`)}
          />
        ))}

        {visibleEventChats.length > 0 && (
          <>
            <SectionTitle>Чаты событий</SectionTitle>
            {visibleEventChats.map((event) => (
              <Row
                key={event.id}
                type="button"
                onClick={() => navigate(`/chats/event/${event.id}`)}
                aria-label={`Чат события: ${event.title}`}
              >
                <Avatar size={48} src={event.image} initials={event.title.slice(0, 1)} />
                <Info>
                  <Name>{event.title}</Name>
                  <StartHint>Чат участников</StartHint>
                </Info>
              </Row>
            ))}
          </>
        )}

        {visibleFriends.length > 0 && (
          <>
            <SectionTitle>Друзья</SectionTitle>
            {visibleFriends.map((friend) => (
              <Row
                key={friend.id}
                type="button"
                onClick={() => navigate(`/chats/${friend.id}`)}
                aria-label={`Написать: ${friend.name}`}
              >
                <Avatar
                  size={48}
                  src={friend.avatar}
                  initials={friend.name.slice(0, 1)}
                  gradientColor={avatarGradient(friend.id)}
                />
                <Info>
                  <Name>{friend.name}</Name>
                  <StartHint>Написать первым</StartHint>
                </Info>
              </Row>
            ))}
          </>
        )}
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
      <Avatar
        size={48}
        src={peer.avatar}
        initials={peer.name.slice(0, 1)}
        gradientColor={avatarGradient(peer.id)}
      />
      <Info>
        <Name $unread={unread > 0}>{peer.name}</Name>
        <Preview $unread={unread > 0}>
          {outgoing && (
            <ReadTick
              $read={Boolean(lastMessage.readAt)}
              aria-label={lastMessage.readAt ? "Прочитано" : "Отправлено"}
            >
              {lastMessage.readAt ? "✓✓" : "✓"}
            </ReadTick>
          )}
          {preview}
        </Preview>
      </Info>
      <Side>
        <Time dateTime={lastMessage.createdAt} $unread={unread > 0}>
          {chatTimeShort(lastMessage.createdAt)}
        </Time>
        {unread > 0 && <Badge aria-label={`${unread} непрочитанных`}>{unread}</Badge>}
      </Side>
    </Row>
  );
}

export default ChatList;
