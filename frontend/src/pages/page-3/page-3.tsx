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
  background: white;
  border-radius: 16px;
  padding: 12px;
  display: flex;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  align-items: stretch;
`;

const EventImage = styled.img`
  width: 100px;
  height: 100px;
  border-radius: 12px;
  object-fit: cover;
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
  color: #000;
`;

const StatusTag = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: #d6f5e4;
  color: #0f7a3c;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
`;

const ActionButton = styled.button`
  background-color: #2d81e0;
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
  color: #818c99;
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

const FilterWrapper = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  min-height: 40px;
  box-sizing: border-box;
  background: ${(props) => (props.$active ? "#2d81e0" : "#f2f3f5")};
  border: 1px solid #2d81e0;
  border-radius: 10px;
  cursor: pointer;
  color: ${(props) => (props.$active ? "#ffffff" : "#2d81e0")};
  white-space: nowrap;
  &:active {
    opacity: 0.8;
  }
`;

/** Чип сброса — как в ленте, появляется только при активных фильтрах. */
const ResetChip = styled(FilterWrapper)`
  background: #ffffff;
  border-color: #e05b5b;
  color: #e05b5b;
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

  const allEvents: EventItem[] = Array.from(
    new Map(
      [...eventStore.acceptedEvents, ...eventStore.createdEvents].map((event) => [event.id, event]),
    ).values(),
  );

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
        <FiltersContainer>
          <FilterWrapper
            $active={selectedInterests.length > 0}
            onClick={() => setActiveModal("interests")}
          >
            <FilterButton>
              Интересы{selectedInterests.length > 0 ? ` (${selectedInterests.length})` : ""}
            </FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper $active={Boolean(filters.date)} onClick={() => setActiveModal("date")}>
            <FilterButton>{filters.date ? `Дата: ${filters.date}` : "Дата"}</FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper $active={filters.timeActive} onClick={() => setActiveModal("time")}>
            <FilterButton>
              {filters.timeActive ? `${filters.startTime}–${filters.endTime}` : "Время"}
            </FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper
            $active={Boolean(filters.location)}
            onClick={() => setActiveModal("place")}
          >
            <FilterButton>{filters.location ? `Место: ${filters.location}` : "Место"}</FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          {filters.hasActiveFilters && (
            <ResetChip onClick={() => filters.reset()}>
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
          emptyTitle={allEvents.length === 0 ? "У вас пока нет событий" : "События не найдены"}
          emptyDescription={
            allEvents.length === 0
              ? "Создайте новый повод или запишитесь на событие из общей ленты."
              : "Попробуйте изменить параметры поиска или фильтры."
          }
          onRetry={() => eventStore.fetchMyEvents(true)}
        >
          <CardGrid>
            {filteredEvents.map((event) => (
              <Card key={event.id}>
                <EventImage src={event.image ?? ""} alt={event.title} />
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
