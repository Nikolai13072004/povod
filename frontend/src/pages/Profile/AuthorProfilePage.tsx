import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styled from "@emotion/styled";
import { Avatar, Button, Panel, PanelHeader, PanelHeaderBack, Group, Chip } from "@vkontakte/vkui";
import { Icon20PlaceOutline } from "@vkontakte/icons";
import { AsyncContent } from "../../components/AsyncContent";
import { eventsAPI, usersAPI, type Event as ApiEvent, type User } from "../../services/api";
import { formatEventDate, formatEventTime } from "../../utils/eventDate";
import { observer } from "mobx-react-lite";
import { sessionStore } from "../../stores/sessionStore";
import { friendsStore } from "../../stores/friendsStore";
import { useToast } from "../../components/Toast/ToastProvider";

const Header = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
`;

/** Кнопки в ряд с переносом: на узком экране две подписи не помещаются. */
const LinkActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding-top: 4px;
`;

const UserName = styled.h1`
  margin: 0;
  font-size: clamp(18px, 5vw, 22px);
  font-weight: 700;
  overflow-wrap: anywhere;
`;

const CityRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vkui--color_text_secondary);
  font-size: 14px;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
`;

const SectionTitle = styled.h2`
  margin: 0 0 12px;
  padding: 0 16px;
  font-size: 16px;
  font-weight: 600;
`;

const EventsList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  padding: 0 16px 16px;
`;

const EventCard = styled.button`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  text-align: left;
  background: var(--vkui--color_background_secondary);
  border: 1px solid var(--vkui--color_separator_primary_alpha);
  border-radius: 16px;
  cursor: pointer;
  font: inherit;
  min-width: 0;

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: 2px;
  }
`;

const EventTitle = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: var(--vkui--color_text_primary);
  overflow-wrap: anywhere;
`;

const EventMeta = styled.span`
  font-size: 13px;
  color: var(--vkui--color_text_secondary);
  overflow-wrap: anywhere;
`;

/**
 * Публичный профиль автора и его открытые события (PROD-005).
 *
 * Данные берутся из публичных эндпоинтов, которые уже не отдают email
 * (`presentPublicUser`), поэтому личные данные здесь не раскрываются.
 */
function AuthorProfilePageView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const showToast = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [linking, setLinking] = useState(false);

  const myId = sessionStore.user.id;
  const isMe = Boolean(id) && id === myId;

  /*
   * Связь берётся из общего стора, а не из локального состояния.
   *
   * Раньше она лежала в трёх компонентах отдельно и заполнялась один раз, при
   * монтировании: действия соседнего экрана и второго человека до неё не
   * доходили никак. Плюс начальным значением было «не друзья», хотя ответа ещё
   * не было, — у настоящего друга рисовалась кнопка «Добавить в друзья»,
   * нажатие возвращало «уже друзья», и статус прыгал обратно.
   */
  const link = friendsStore.linkTo(id ?? "");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    const [userResponse, eventsResponse] = await Promise.all([
      usersAPI.getById(id),
      eventsAPI.getByAuthor(id),
    ]);

    if (userResponse.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (userResponse.error || !userResponse.data) {
      setError(userResponse.error ?? "Не удалось загрузить профиль");
      setLoading(false);
      return;
    }

    setUser(userResponse.data);
    setEvents(eventsResponse.data ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!myId) return;
    void friendsStore.load(myId);
    // Пока экран открыт, второй человек мог принять заявку или убрать из
    // друзей: без опроса это видно только после перезагрузки.
    friendsStore.startPolling(myId);
    return () => friendsStore.stopPolling();
  }, [myId]);

  const requestFriendship = async () => {
    if (!id || !myId) return;
    setLinking(true);
    const outcome = await friendsStore.request(myId, id);
    setLinking(false);
    if (!outcome) {
      showToast("Не удалось отправить заявку", { type: "error" });
      return;
    }
    // «friends» — встречная заявка уже висела, и этот вызов её принял.
    showToast(
      outcome === "friends"
        ? `${user?.name ?? "Пользователь"} теперь у вас в друзьях`
        : "Заявка отправлена",
      { type: "success" },
    );
  };

  const cancelFriendship = async () => {
    if (!id || !myId) return;
    setLinking(true);
    const removed = await friendsStore.remove(myId, id);
    setLinking(false);
    if (!removed) showToast("Не удалось изменить связь", { type: "error" });
  };

  return (
    <Panel id="author-profile">
      <PanelHeader fixed={false} before={<PanelHeaderBack onClick={() => navigate(-1)} />}>
        Профиль
      </PanelHeader>

      <Group>
        <AsyncContent
          loading={loading}
          error={error}
          empty={notFound}
          loadingTitle="Загружаем профиль…"
          errorTitle="Не удалось открыть профиль"
          emptyTitle="Пользователь не найден"
          emptyDescription="Возможно, профиль был удалён."
          onRetry={load}
        >
          {user && (
            <>
              <Header>
                <Avatar size={88} src={user.avatar} initials={user.name?.[0]} />
                <UserName>{user.name}</UserName>
                {user.city && (
                  <CityRow>
                    <Icon20PlaceOutline width={16} height={16} />
                    {user.city}
                  </CityRow>
                )}
                {user.interests && user.interests.length > 0 && (
                  <Chips>
                    {user.interests.map((interest) => (
                      <Chip key={interest} removable={false}>
                        {interest}
                      </Chip>
                    ))}
                  </Chips>
                )}

                {/*
                  Связь начинается отсюда. До этого отправить заявку было
                  негде вовсе: принять чужую интерфейс умел, а свою послать —
                  нет, и подружиться через приложение было невозможно.
                */}
                {/*
                  При `unknown` не рисуем ничего: показать «Добавить в друзья»
                  тому, кто уже друг, хуже, чем показать пустоту на полсекунды.
                */}
                {!isMe && myId && link !== "unknown" && (
                  <LinkActions>
                    {link === "none" && (
                      <Button loading={linking} disabled={linking} onClick={requestFriendship}>
                        Добавить в друзья
                      </Button>
                    )}
                    {link === "outgoing" && (
                      <Button mode="secondary" disabled={linking} onClick={cancelFriendship}>
                        Отменить заявку
                      </Button>
                    )}
                    {link === "incoming" && (
                      <Button loading={linking} disabled={linking} onClick={requestFriendship}>
                        Принять заявку
                      </Button>
                    )}
                    {link === "friends" && (
                      <>
                        <Button onClick={() => navigate(`/chats/${id}`)}>Написать</Button>
                        <Button mode="secondary" disabled={linking} onClick={cancelFriendship}>
                          Убрать из друзей
                        </Button>
                      </>
                    )}
                  </LinkActions>
                )}
              </Header>

              <SectionTitle>Открытые события ({events.length})</SectionTitle>
              <AsyncContent
                loading={false}
                empty={events.length === 0}
                emptyTitle="Пока нет открытых событий"
                emptyDescription="Здесь появятся публичные поводы этого пользователя."
                compact
              >
                <EventsList>
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      type="button"
                      onClick={() => navigate(`/page-1/${event.id}`)}
                    >
                      <EventTitle>{event.title}</EventTitle>
                      <EventMeta>
                        {formatEventDate(event.startsAt, event.timezone)} в{" "}
                        {formatEventTime(event.startsAt, event.timezone)}
                      </EventMeta>
                      {event.location && <EventMeta>{event.location}</EventMeta>}
                    </EventCard>
                  ))}
                </EventsList>
              </AsyncContent>
            </>
          )}
        </AsyncContent>
      </Group>
    </Panel>
  );
}

/** observer: связь живёт в MobX-сторе, без обёртки экран о ней не узнает. */
export const AuthorProfilePage = observer(AuthorProfilePageView);
