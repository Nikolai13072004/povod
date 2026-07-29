import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styled from "@emotion/styled";
import { Avatar, Button, Panel, PanelHeader, PanelHeaderBack, Group, Chip } from "@vkontakte/vkui";
import { Icon20PlaceOutline } from "@vkontakte/icons";
import { AsyncContent } from "../../components/AsyncContent";
import { eventsAPI, usersAPI, type Event as ApiEvent, type User } from "../../services/api";
import { formatEventDate, formatEventTime } from "../../utils/eventDate";
import { sessionStore } from "../../stores/sessionStore";
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

/** Состояние связи с человеком: от него зависит единственная кнопка. */
type LinkState = "none" | "outgoing" | "incoming" | "friends";

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
export function AuthorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const showToast = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [link, setLink] = useState<LinkState>("none");
  const [linking, setLinking] = useState(false);

  const myId = sessionStore.user.id;
  const isMe = Boolean(id) && id === myId;

  /**
   * Состояние связи с этим человеком.
   *
   * Определяется не одним запросом: сервер отдаёт список друзей и список
   * заявок отдельно, а показать надо одну кнопку. Владелец профиля своих
   * заявок не увидит — они спрашиваются от своего имени.
   */
  const loadLink = useCallback(async () => {
    if (!id || !myId || id === myId) return;
    const [friends, requests] = await Promise.all([
      usersAPI.getFriends(myId),
      usersAPI.getFriendRequests(myId),
    ]);
    if (friends.data?.some((friend) => friend.id === id)) {
      setLink("friends");
      return;
    }
    if (requests.data?.outgoing.some((person) => person.id === id)) {
      setLink("outgoing");
      return;
    }
    if (requests.data?.incoming.some((person) => person.id === id)) {
      setLink("incoming");
      return;
    }
    setLink("none");
  }, [id, myId]);

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
    void loadLink();
  }, [load, loadLink]);

  const requestFriendship = async () => {
    if (!id || !myId) return;
    setLinking(true);
    const response = await usersAPI.addFriend(myId, id);
    setLinking(false);
    if (!response.data) {
      showToast(response.error ?? "Не удалось отправить заявку", { type: "error" });
      return;
    }
    // `accepted` — встречная заявка уже висела, и этот вызов её принял.
    setLink(response.data.status === "accepted" ? "friends" : "outgoing");
    showToast(
      response.data.status === "accepted"
        ? `${user?.name ?? "Пользователь"} теперь у вас в друзьях`
        : "Заявка отправлена",
      { type: "success" },
    );
  };

  const cancelFriendship = async () => {
    if (!id || !myId) return;
    setLinking(true);
    const response = await usersAPI.removeFriend(myId, id);
    setLinking(false);
    if (response.error) {
      showToast(response.error, { type: "error" });
      return;
    }
    setLink("none");
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
                {!isMe && myId && (
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
