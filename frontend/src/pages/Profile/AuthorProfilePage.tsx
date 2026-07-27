import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styled from "@emotion/styled";
import { Avatar, Panel, PanelHeader, PanelHeaderBack, Group, Chip } from "@vkontakte/vkui";
import { Icon20PlaceOutline } from "@vkontakte/icons";
import { AsyncContent } from "../../components/AsyncContent";
import { eventsAPI, usersAPI, type Event as ApiEvent, type User } from "../../services/api";
import { formatEventDate, formatEventTime } from "../../utils/eventDate";

const Header = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
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
    outline: 2px solid #2d81e0;
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

  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

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

  return (
    <Panel id="author-profile">
      <PanelHeader before={<PanelHeaderBack onClick={() => navigate(-1)} />}>Профиль</PanelHeader>

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
