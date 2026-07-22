import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Spinner } from "@vkontakte/vkui";
import {
  Icon28CalendarOutline,
  Icon28ClockOutline,
  Icon28PlaceOutline,
  Icon28SearchOutline,
} from "@vkontakte/icons";
import { OpenFilterIcon } from "../../icons/icons";
import { useNavigate } from "react-router-dom";
import { eventStore } from "../../stores/EventStore";

import {
  InterestsFilter,
  DateFilter,
  TimeFilter,
  LocationFilter,
  type FilterOption,
} from "../../components/Filters";

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
  display: flex;
  flex-direction: column;
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
  height: 160px;
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
  gap: 10px 14px;
  font-size: 13px;
  color: var(--vkui--color_text_secondary);
`;
const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;
const EventActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

const StateBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--vkui--color_text_secondary);
  text-align: center;
`;

const ResultCount = styled.div`
  font-size: 13px;
  color: var(--vkui--color_text_secondary);
  padding: 0 2px 4px;
`;

const INTEREST_OPTIONS: FilterOption[] = [
  { id: "1", label: "Спорт", selected: false },
  { id: "2", label: "Искусство", selected: false },
  { id: "3", label: "Путешествия", selected: false },
  { id: "4", label: "IT", selected: false },
  { id: "5", label: "Компьютерные игры", selected: false },
  { id: "6", label: "Технологии", selected: false },
  { id: "7", label: "Еда", selected: false },
  { id: "8", label: "Настольные игры", selected: false },
  { id: "9", label: "Наука", selected: false },
  { id: "10", label: "Музыка", selected: false },
  { id: "11", label: "Саморазвитие", selected: false },
  { id: "12", label: "Образование", selected: false },
  { id: "13", label: "Кино", selected: false },
  { id: "14", label: "Шопинг", selected: false },
  { id: "15", label: "Ресторан", selected: false },
  { id: "16", label: "Музей", selected: false },
  { id: "17", label: "Отдых", selected: false },
];

/** "DD/MM/YY" | "DD.MM.YYYY" -> timestamp (для сравнения дат). */
function parseEventDate(date: string): number {
  const m = date.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return 0;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return new Date(year, Number(m[2]) - 1, Number(m[1])).getTime();
}

function FirstPageComponent() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    date: "",
    location: "",
    startTime: "",
    endTime: "",
  });
  const [activeModal, setActiveModal] = useState<"interests" | "date" | "time" | "place" | null>(
    null,
  );
  const [interestOptions, setInterestOptions] = useState<FilterOption[]>(INTEREST_OPTIONS);

  useEffect(() => {
    eventStore.fetchEvents();
  }, []);

  const handleApplyDate = (date: string) => setFilters((prev) => ({ ...prev, date }));
  const handleApplyLocation = (loc: string) => setFilters((prev) => ({ ...prev, location: loc }));
  const handleApplyTime = (start: string, end: string) =>
    setFilters((prev) => ({ ...prev, startTime: start, endTime: end }));

  const handleToggleInterest = (id: string) => {
    setInterestOptions((prev) =>
      prev.map((opt) => (opt.id === id ? { ...opt, selected: !opt.selected } : opt)),
    );
  };

  const selectedInterests = interestOptions.filter((opt) => opt.selected).map((opt) => opt.label);

  const query = searchQuery.toLowerCase().trim();
  const fromDate = filters.date ? parseEventDate(filters.date) : 0;

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
    const matchesDate = !fromDate || parseEventDate(event.date) >= fromDate;

    const matchesPlace =
      !filters.location ||
      (event.place ?? event.location ?? "")
        .toLowerCase()
        .includes(filters.location.toLowerCase().trim());

    const matchesTime =
      !filters.startTime ||
      !filters.endTime ||
      (event.time >= filters.startTime && event.time <= filters.endTime);

    return matchesSearch && matchesCategory && matchesDate && matchesPlace && matchesTime;
  });

  const handleHideEvent = (id: string) => setHiddenIds((prev) => [...prev, id]);

  const timeActive = Boolean(filters.startTime && filters.endTime);
  const hasActiveFilters =
    Boolean(query) ||
    selectedInterests.length > 0 ||
    Boolean(filters.date) ||
    Boolean(filters.location) ||
    timeActive;

  const resetFilters = () => {
    setSearchQuery("");
    setFilters({ date: "", location: "", startTime: "", endTime: "" });
    setInterestOptions((prev) => prev.map((o) => ({ ...o, selected: false })));
  };

  const isInitialLoading = eventStore.isLoading && eventStore.events.length === 0;

  return (
    <PageContainer>
      <SearchContainer>
        <Icon28SearchOutline />
        <SearchInput
          type="text"
          placeholder="Поиск..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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

      {isInitialLoading && (
        <StateBox>
          <Spinner size="l" />
          <span>Загружаем поводы…</span>
        </StateBox>
      )}

      {!isInitialLoading && eventStore.error && (
        <StateBox>
          <span>⚠️ {eventStore.error}</span>
          <Button size="m" mode="secondary" onClick={() => eventStore.fetchEvents(true)}>
            Повторить
          </Button>
        </StateBox>
      )}

      {!isInitialLoading && !eventStore.error && (
        <>
          {hasActiveFilters && (
            <ResultCount>Найдено поводов: {filteredEvents.length}</ResultCount>
          )}
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
                  <span>{event.date}</span>
                </MetaRow>
                <MetaRow>
                  <Icon28ClockOutline />
                  <span>{event.time}</span>
                </MetaRow>
                <MetaRow>
                  <Icon28PlaceOutline />
                  <span>{event.place}</span>
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

          {filteredEvents.length === 0 && (
            <StateBox>
              <span>Поводы не найдены</span>
            </StateBox>
          )}
          </EventsList>
        </>
      )}

      <InterestsFilter
        isOpen={activeModal === "interests"}
        onClose={() => setActiveModal(null)}
        options={interestOptions}
        onToggle={handleToggleInterest}
      />
      <DateFilter
        isOpen={activeModal === "date"}
        onClose={() => setActiveModal(null)}
        onSave={handleApplyDate}
      />
      <LocationFilter
        isOpen={activeModal === "place"}
        onClose={() => setActiveModal(null)}
        onSave={handleApplyLocation}
      />
      <TimeFilter
        isOpen={activeModal === "time"}
        onClose={() => setActiveModal(null)}
        onSave={handleApplyTime}
      />
    </PageContainer>
  );
}

export const FirstPage = observer(FirstPageComponent);
