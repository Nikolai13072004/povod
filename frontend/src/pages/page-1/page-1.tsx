import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@vkontakte/vkui";
import {
  Icon28CalendarOutline,
  Icon28ClockOutline,
  Icon28PlaceOutline,
  Icon28SearchOutline,
} from "@vkontakte/icons";
import { OpenFilterIcon } from "../../icons/icons";
import { useNavigate } from "react-router-dom";
import { eventStore } from "../../stores/EventStore";
import { AsyncContent } from "../../components/AsyncContent";
import {
  eventDateKey,
  eventTimeKey,
  filterDateKey,
  formatEventDate,
  formatEventTime,
} from "../../utils/eventDate";

import { InterestsFilter, DateFilter, TimeFilter, LocationFilter } from "../../components/Filters";
import { filtersStore } from "../../stores/filtersStore";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 18px 24px;
  min-height: 100%;
  background: var(--vkui--color_background_primary);
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

const EventsList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`;

const FiltersContainer = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
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

const EventCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--vkui--color_background_secondary);
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
`;
const EventImage = styled.div`
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 16px;
  background: linear-gradient(135deg, #67b5ff 0%, #3d88ff 100%);
  overflow: hidden;
  position: relative;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;
const EventTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
`;
const EventMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  font-size: 13px;
  color: var(--vkui--color_text_secondary);
`;
const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;
const EventActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

const ResultCount = styled.div`
  font-size: 13px;
  color: var(--vkui--color_text_secondary);
  padding: 0 2px 4px;
`;

function FirstPageComponent() {
  const navigate = useNavigate();
  // Фильтры живут в сторе, поэтому переживают уход на другую вкладку и возврат.
  const filters = filtersStore.feed;
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [activeModal, setActiveModal] = useState<"interests" | "date" | "time" | "place" | null>(
    null,
  );

  useEffect(() => {
    eventStore.fetchEvents();
  }, []);

  const selectedInterests = filters.selectedInterests;

  const query = filters.search.toLowerCase().trim();
  const fromDate = filterDateKey(filters.date);

  const filteredEvents = eventStore.events.filter((event) => {
    if (hiddenIds.includes(event.id)) return false;

    // Поиск по названию, описанию, месту, категории и тегам
    const haystack = [
      event.title,
      event.description,
      event.place,
      event.location,
      event.category,
      ...(event.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !query || haystack.includes(query);

    // Интересы сверяем с категорией И тегами события
    const eventLabels = [event.category, ...(event.tags ?? [])]
      .filter(Boolean)
      .map((s) => (s as string).toLowerCase());
    const matchesCategory =
      selectedInterests.length === 0 ||
      selectedInterests.some((i) => eventLabels.includes(i.toLowerCase()));

    // Дата: события в выбранный день или позже
    const matchesDate = !fromDate || eventDateKey(event.startsAt, event.timezone) >= fromDate;

    const matchesPlace =
      !filters.location ||
      (event.place ?? event.location ?? "")
        .toLowerCase()
        .includes(filters.location.toLowerCase().trim());

    const localTime = eventTimeKey(event.startsAt, event.timezone);
    const matchesTime =
      !filters.startTime ||
      !filters.endTime ||
      (localTime >= filters.startTime && localTime <= filters.endTime);

    return matchesSearch && matchesCategory && matchesDate && matchesPlace && matchesTime;
  });

  const handleHideEvent = (id: string) => setHiddenIds((prev) => [...prev, id]);

  const timeActive = filters.timeActive;
  const hasActiveFilters = filters.hasActiveFilters;

  const resetFilters = () => filters.reset();

  const isInitialLoading = eventStore.isLoading && eventStore.events.length === 0;

  return (
    <PageContainer>
      <SearchContainer>
        <Icon28SearchOutline />
        <SearchInput
          type="text"
          placeholder="Поиск..."
          value={filters.search}
          onChange={(e) => filters.setSearch(e.target.value)}
        />
      </SearchContainer>

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

        <FilterWrapper $active={timeActive} onClick={() => setActiveModal("time")}>
          <FilterButton>
            {timeActive ? `${filters.startTime}–${filters.endTime}` : "Время"}
          </FilterButton>
          <OpenFilterIcon />
        </FilterWrapper>

        <FilterWrapper $active={Boolean(filters.location)} onClick={() => setActiveModal("place")}>
          <FilterButton>{filters.location ? `Место: ${filters.location}` : "Место"}</FilterButton>
          <OpenFilterIcon />
        </FilterWrapper>

        {hasActiveFilters && (
          <ResetChip onClick={resetFilters}>
            <FilterButton>Сбросить ✕</FilterButton>
          </ResetChip>
        )}
      </FiltersContainer>

      <AsyncContent
        loading={isInitialLoading}
        error={eventStore.error}
        empty={!isInitialLoading && filteredEvents.length === 0}
        loadingTitle="Загружаем поводы…"
        errorTitle="Не удалось загрузить ленту"
        emptyTitle={hasActiveFilters ? "По выбранным фильтрам ничего нет" : "Пока нет поводов"}
        emptyDescription={
          hasActiveFilters
            ? "Попробуйте изменить параметры поиска или сбросить фильтры."
            : "Новые события появятся здесь после публикации."
        }
        onRetry={() => eventStore.fetchEvents(true)}
      >
        <>
          {hasActiveFilters && <ResultCount>Найдено поводов: {filteredEvents.length}</ResultCount>}
          <EventsList>
            {filteredEvents.map((event) => (
              <EventCard key={event.id} onClick={() => navigate(`/page-1/${event.id}`)}>
                <EventImage>
                  {event.image && <img src={event.image} alt={event.title} />}
                </EventImage>
                <EventTitle>{event.title}</EventTitle>
                <EventMeta>
                  <MetaRow>
                    <Icon28CalendarOutline />
                    <span>{formatEventDate(event.startsAt, event.timezone)}</span>
                  </MetaRow>
                  <MetaRow>
                    <Icon28ClockOutline />
                    <span>{formatEventTime(event.startsAt, event.timezone)}</span>
                  </MetaRow>
                  <MetaRow>
                    <Icon28PlaceOutline />
                    <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{event.place}</span>
                  </MetaRow>
                </EventMeta>
                <EventActions>
                  <Button
                    size="m"
                    mode="tertiary"
                    stretched
                    onClick={(e) => {
                      e.stopPropagation();
                      handleHideEvent(event.id);
                    }}
                  >
                    Не сейчас
                  </Button>
                  <Button
                    size="m"
                    mode="primary"
                    stretched
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/page-1/${event.id}`);
                    }}
                  >
                    Присоединиться
                  </Button>
                </EventActions>
              </EventCard>
            ))}
          </EventsList>
        </>
      </AsyncContent>

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
      <LocationFilter
        isOpen={activeModal === "place"}
        onClose={() => setActiveModal(null)}
        onSave={(place: string) => filters.setLocation(place)}
      />
      <TimeFilter
        isOpen={activeModal === "time"}
        onClose={() => setActiveModal(null)}
        onSave={(start: string, end: string) => filters.setTimeRange(start, end)}
      />
    </PageContainer>
  );
}

export const FirstPage = observer(FirstPageComponent);
