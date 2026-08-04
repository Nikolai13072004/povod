import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "@emotion/styled";
import { Avatar, Group, Panel, PanelHeader, PanelHeaderBack, Search } from "@vkontakte/vkui";
import { AsyncContent } from "../../components/AsyncContent";
import { DialogListSkeleton } from "../../components/Skeleton";
import { usersAPI, type User } from "../../services/api";
import { avatarInitials } from "../../lib/avatarInitials";
import { sessionStore } from "../../stores/sessionStore";

/**
 * Люди (PROD-012).
 *
 * До этого экрана чужой профиль открывался ровно одним способом — кликом по
 * автору на странице события. Значит человека, который ещё не создал ни одного
 * повода, нельзя было найти вообще: ни подружиться с ним, ни написать ему.
 * Заявка в друзья и переписка существовали, но были недостижимы.
 *
 * Поиск локальный: сервер отдаёт не больше сотни человек, ходить за фильтром
 * на бэкенд незачем. Когда список перестанет помещаться, поиск переедет туда
 * вместе с постраничностью.
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

const Meta = styled.div`
  font-size: 13px;
  color: var(--povod-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export function PeoplePage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await usersAPI.getAll();
    if (response.data) {
      // Себя из списка убираем: подружиться с собой нельзя, а строка сбивает.
      setPeople(response.data.filter((person) => person.id !== sessionStore.user.id));
    } else {
      setError(response.error ?? "Не удалось загрузить список");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const normalized = query.trim().toLocaleLowerCase("ru");
  const visible = normalized
    ? people.filter((person) =>
        [person.name, person.city]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase("ru").includes(normalized)),
      )
    : people;

  return (
    <Panel id="people">
      <PanelHeader fixed={false} before={<PanelHeaderBack onClick={() => navigate(-1)} />}>
        Люди
      </PanelHeader>

      <Group mode="plain">
        <Search
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя или город"
          aria-label="Поиск людей"
        />
        <AsyncContent
          loading={loading}
          skeleton={<DialogListSkeleton />}
          loadingTitle="Загружаем людей…"
          error={error}
          onRetry={load}
          empty={visible.length === 0}
          emptyTitle={normalized ? "Никого не нашлось" : "Пока никого нет"}
          emptyDescription={
            normalized
              ? "Попробуйте другое имя или город."
              : "Здесь появятся другие участники ПОВОД."
          }
          emptyActions={
            normalized
              ? [{ label: "Сбросить поиск", onClick: () => setQuery(""), mode: "primary" }]
              : [{ label: "Открыть ленту", onClick: () => navigate("/page-1"), mode: "primary" }]
          }
        >
          {visible.map((person) => (
            <Row
              key={person.id}
              type="button"
              onClick={() => navigate(`/users/${person.id}`)}
              aria-label={`Профиль: ${person.name}`}
            >
              <Avatar
                size={48}
                src={person.avatar}
                initials={avatarInitials(person.avatar, person.name)}
              />
              <Info>
                <Name>{person.name}</Name>
                {(person.city || person.interests?.length) && (
                  <Meta>
                    {[person.city, person.interests?.slice(0, 3).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </Meta>
                )}
              </Info>
            </Row>
          ))}
        </AsyncContent>
      </Group>
    </Panel>
  );
}

export default PeoplePage;
