import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import {
  Icon28CalendarOutline,
  Icon28ClockOutline,
  Icon28PlaceOutline,
  Icon28SearchOutline,
} from "@vkontakte/icons";
import { DateFilter, InterestsFilter, LocationFilter, TimeFilter } from "../../components/Filters";
import { OpenFilterIcon } from "../../icons/icons";
import { useNavigate } from "react-router-dom";
import { eventStore } from "../../stores/EventStore";
import { filtersStore } from "../../stores/filtersStore";
import { EventCover } from "../../components/EventCover/EventCover";
import { AsyncContent } from "../../components/AsyncContent";
import {
  eventDateKey,
  eventTimeKey,
  filterDateKey,
  formatEventDate,
  formatEventTime,
} from "../../utils/eventDate";

const PageContainer = styled.div`
  background-color: transparent;
  min-height: 100vh;
  padding-bottom: 100px;
`;

const ContentPadding = styled.div`
  padding: 0 16px;
`;
const SearchContainer = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  background: var(--vkui--color_background_secondary);
  border-radius: 16px;
  border: 1px solid var(--vkui--color_separator_primary_alpha);
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--vkui--color_text_primary);
  outline: none;
  &::placeholder {
    color: var(--vkui--color_text_secondary);
  }
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
`;

const Card = styled.div`
  background: var(--povod-surface);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  align-items: stretch;
`;

/** Обложка в «Моих событиях» — фиксированной ширины, остальное задаёт EventCover. */
const CoverSlot = styled.div`
  width: 100px;
  flex-shrink: 0;
`;
const EventInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;
const EventTitle = styled.h3`
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--povod-text);
`;

const StatusTag = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--povod-success-surface);
  color: var(--povod-success);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
`;

const ActionButton = styled.button`
  background-color: var(--povod-primary);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 12px;
  width: 100%;
  font-size: 16px;
  font-weight: 400;
  margin-top: 8px;
  cursor: pointer;

  &:active {
    opacity: 0.8;
  }
`;

const DetailRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--povod-text-secondary);
  font-size: 12px;
  margin-bottom: 2px;
  padding-top: 4px;
  margin-left: 0px;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const FiltersContainer = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 14px;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const FilterWrapper = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  min-height: 40px;
  box-sizing: border-box;
  background: ${(props) => (props.$active ? "var(--povod-primary)" : "var(--povod-surface-muted)")};
  border: 1px solid var(--povod-primary);
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  color: ${(props) => (props.$active ? "var(--povod-on-primary)" : "var(--povod-primary)")};
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: 2px;
  }

  &:active {
    opacity: 0.8;
  }
`;

const TabsRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
`;

const TabButton = styled.button<{ $active: boolean }>`
  flex: 1 1 auto;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid
    ${(props) => (props.$active ? "var(--povod-primary)" : "var(--povod-border-strong)")};
  border-radius: 12px;
  background: ${(props) => (props.$active ? "var(--povod-primary)" : "var(--povod-surface)")};
  color: ${(props) => (props.$active ? "var(--povod-on-primary)" : "var(--povod-text-secondary)")};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;

  &:active {
    opacity: 0.85;
  }
`;

/** Чип сброса — как в ленте, появляется только при активных фильтрах. */
const ResetChip = styled(FilterWrapper)`
  background: var(--povod-surface);
  border-color: var(--povod-danger);
  color: var(--povod-danger);
`;

const FilterButton = styled.span`
  font-size: 14px;
  font-weight: 400;
  color: inherit;
`;
const DateContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

interface EventItem {
  id: string;
  title: string;
  startsAt: string;
  timezone: string;
  location?: string;
  place?: string;
  category?: string;
  image?: string | null;
}

// const MOCK_EVENTS: EventItem[] = [
//   {
//     id: 11,
//     title: "Локальный Хакатон: Code & Chill",
//     date: "19/06/26",
//     time: "16:00",
//     location: "IT-vibe",
//     category: "Хакатоны",
//     image:
//       "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=300&h=300&auto=format&fit=crop",
//   },
//   {
//     id: 12,
//     title: "Кофе на Восстания",
//     date: "23/06/26",
//     time: "08:30",
//     location: "Кофейня",
//     category: "Еда",
//     image:
//       "https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=300&h=300&auto=format&fit=crop",
//   },
//   {
//     id: 13,
//     title: 'Премьера "Человек-паук"',
//     date: "31/07/26",
//     time: "10:00",
//     location: "Кинотеатр",
//     category: "Кино",
//     image:
//       "https://avatars.mds.yandex.net/i?id=a5ef6ee128706c92cfdaa5e75a3afff0_l-4373855-images-thumbs&n=13",
//   },
// ];

function SignUpEventsPage() {
  const navigate = useNavigate();
  // Фильтры раздела живут в сторе и не теряются при переходе на другую вкладку.
  const filters = filtersStore.myEvents;

  useEffect(() => {
    eventStore.fetchMyEvents();
  }, []);

  const [activeModal, setActiveModal] = useState<"interests" | "date" | "time" | "place" | null>(
    null,
  );

  const searchQuery = filters.search;
  const selectedInterests = filters.selectedInterests;

  // Вкладки «Все / Созданные / Посещаю» (FE-008): раздел раньше показывал
  // созданные и посещаемые события одной кучей, без счётчиков.
  const createdEvents: EventItem[] = eventStore.createdEvents;
  const attendingEvents: EventItem[] = eventStore.acceptedEvents;
  const combinedEvents: EventItem[] = Array.from(
    new Map([...attendingEvents, ...createdEvents].map((event) => [event.id, event])).values(),
  );

  const tab = filtersStore.myEventsTab;
  const allEvents: EventItem[] =
    tab === "created" ? createdEvents : tab === "attending" ? attendingEvents : combinedEvents;

  const filteredEvents = allEvents.filter((event) => {
    const matchesCategory =
      selectedInterests.length === 0 || selectedInterests.includes(event.category ?? "");

    const selectedDate = filterDateKey(filters.date);
    const matchesDate =
      !selectedDate || eventDateKey(event.startsAt, event.timezone) === selectedDate;

    const matchesPlace =
      !filters.location ||
      (event.location || event.place || "")
        .toLowerCase()
        .includes(filters.location.toLowerCase().trim());

    const localTime = eventTimeKey(event.startsAt, event.timezone);
    const matchesTime =
      (!filters.startTime || localTime >= filters.startTime) &&
      (!filters.endTime || localTime <= filters.endTime);

    const matchesSearch =
      !searchQuery.trim() ||
      [event.title, event.location, event.place, event.category]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru")
        .includes(searchQuery.trim().toLocaleLowerCase("ru"));

    return matchesSearch && matchesCategory && matchesDate && matchesPlace && matchesTime;
  });

  return (
    <PageContainer>
      <ContentPadding>
        <SearchContainer>
          <Icon28SearchOutline />
          <SearchInput
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => filters.setSearch(e.target.value)}
          />
        </SearchContainer>
      </ContentPadding>

      <ContentPadding style={{ marginTop: "16px" }}>
        <TabsRow role="tablist" aria-label="Мои события">
          {(
            [
              { id: "all", label: "Все", count: combinedEvents.length },
              { id: "created", label: "Созданные", count: createdEvents.length },
              { id: "attending", label: "Посещаю", count: attendingEvents.length },
            ] as const
          ).map((item) => (
            <TabButton
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              $active={tab === item.id}
              onClick={() => filtersStore.setMyEventsTab(item.id)}
            >
              {item.label} ({item.count})
            </TabButton>
          ))}
        </TabsRow>

        <FiltersContainer>
          <FilterWrapper
            type="button"
            $active={selectedInterests.length > 0}
            onClick={() => setActiveModal("interests")}
          >
            <FilterButton>
              Интересы{selectedInterests.length > 0 ? ` (${selectedInterests.length})` : ""}
            </FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper
            type="button"
            $active={Boolean(filters.date)}
            onClick={() => setActiveModal("date")}
          >
            <FilterButton>{filters.date ? `Дата: ${filters.date}` : "Дата"}</FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper
            type="button"
            $active={filters.timeActive}
            onClick={() => setActiveModal("time")}
          >
            <FilterButton>
              {filters.timeActive ? `${filters.startTime}–${filters.endTime}` : "Время"}
            </FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper
            type="button"
            $active={Boolean(filters.location)}
            onClick={() => setActiveModal("place")}
          >
            <FilterButton>{filters.location ? `Место: ${filters.location}` : "Место"}</FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          {filters.hasActiveFilters && (
            <ResetChip type="button" onClick={() => filters.reset()}>
              <FilterButton>Сбросить ✕</FilterButton>
            </ResetChip>
          )}
        </FiltersContainer>

        <AsyncContent
          loading={eventStore.isMyEventsLoading && allEvents.length === 0}
          error={eventStore.myEventsError}
          empty={filteredEvents.length === 0}
          loadingTitle="Загружаем ваши поводы…"
          errorTitle="Не удалось загрузить ваши события"
          emptyTitle={
            allEvents.length > 0
              ? "События не найдены"
              : tab === "created"
                ? "Вы ещё не создавали события"
                : tab === "attending"
                  ? "Вы пока никуда не записались"
                  : "У вас пока нет событий"
          }
          emptyDescription={
            allEvents.length > 0
              ? "Попробуйте изменить параметры поиска или фильтры."
              : tab === "created"
                ? "Создайте свой повод — он появится здесь."
                : "Запишитесь на событие из общей ленты — оно появится здесь."
          }
          onRetry={() => eventStore.fetchMyEvents(true)}
        >
          <CardGrid>
            {filteredEvents.map((event) => (
              <Card key={event.id}>
                <CoverSlot>
                  <EventCover
                    src={event.image}
                    title={event.title}
                    ratio="1 / 1"
                    rounded="12px"
                    className="my-events-cover"
                  />
                </CoverSlot>
                <EventInfo>
                  <div>
                    {eventStore.acceptedEvents.some((accepted) => accepted.id === event.id) && (
                      <StatusTag>Записан</StatusTag>
                    )}
                    <EventTitle>{event.title}</EventTitle>
                    <DateContainer>
                      <DetailRow>
                        <Icon28CalendarOutline width={16} height={16} />{" "}
                        {formatEventDate(event.startsAt, event.timezone)}
                      </DetailRow>
                      <DetailRow>
                        <Icon28ClockOutline width={16} height={16} />{" "}
                        {formatEventTime(event.startsAt, event.timezone)}
                      </DetailRow>
                      <DetailRow>
                        <Icon28PlaceOutline width={16} height={16} />{" "}
                        {event.location || event.place}
                      </DetailRow>
                    </DateContainer>
                  </div>

                  <ActionButton onClick={() => navigate(`/page-1/${event.id}`)}>
                    Перейти к поводу
                  </ActionButton>
                </EventInfo>
              </Card>
            ))}
          </CardGrid>
        </AsyncContent>
      </ContentPadding>

      <InterestsFilter
        isOpen={activeModal === "interests"}
        onClose={() => setActiveModal(null)}
        options={filters.interestOptions}
        onToggle={(id: string) => filters.toggleInterest(id)}
      />

      <DateFilter
        isOpen={activeModal === "date"}
        onClose={() => setActiveModal(null)}
        onSave={(date: string) => filters.setDate(date)}
      />

      <TimeFilter
        isOpen={activeModal === "time"}
        onClose={() => setActiveModal(null)}
        onSave={(start: string, end: string) => filters.setTimeRange(start, end)}
      />

      <LocationFilter
        isOpen={activeModal === "place"}
        onClose={() => setActiveModal(null)}
        onSave={(place: string) => filters.setLocation(place)}
      />
    </PageContainer>
  );
}

export default observer(SignUpEventsPage);
