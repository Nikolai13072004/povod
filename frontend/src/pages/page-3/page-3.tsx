import { observer } from "mobx-react-lite";
import { useState } from "react";
import styled from "@emotion/styled";
import {
  Icon28CalendarOutline,
  Icon28ClockOutline,
  Icon28PlaceOutline,
  Icon28SearchOutline,
} from "@vkontakte/icons";
import {
  DateFilter,
  InterestsFilter,
  LocationFilter,
  TimeFilter,
  type FilterOption,
} from "../../components/Filters";
import NavMenu from "../../components/NavMenu";
import { OpenFilterIcon } from "../../icons/icons";
import { useNavigate } from "react-router-dom";
import { eventStore } from "../../stores/EventStore";

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
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--vkui--color_text_primary);
  outline: none;
  &::placeholder {
    color: var(--vkui--color_text_secondary);
  }
`;

const Card = styled.div`
  background: white;
  border-radius: 16px;
  padding: 12px;
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
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
  margin-right: 5px;

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
  margin-right: 5px;
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

const FilterWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: #f2f3f5;
  border: 1px solid #2d81e0;
  border-radius: 10px;
  cursor: pointer;
  color: #2d81e0;
  white-space: nowrap;
  &:active {
    opacity: 0.8;
  }
`;

const FilterButton = styled.span`
  font-size: 14px;
  font-weight: 400;
  color: #2d81e0;
`;
const DateContainer = styled.div`
  display: flex;
  flex-direction: row;
`;

interface EventItem {
  id: number;
  title: string;
  date: string;
  time: string;
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
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    date: "",
    location: "",
    startTime: "",
    endTime: "",
  });

  const [interestOptions, setInterestOptions] = useState<FilterOption[]>([
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
  ]);

  const [activeModal, setActiveModal] = useState<"interests" | "date" | "time" | "place" | null>(
    null,
  );

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

  const allEvents: EventItem[] = [
    // ...MOCK_EVENTS,
    ...eventStore.acceptedEvents,
    ...eventStore.createdEvents,
  ];

  const filteredEvents = allEvents.filter((event) => {
    const matchesCategory =
      selectedInterests.length === 0 || selectedInterests.includes(event.category ?? "");

    const formattedFilterDate = filters.date
      ? filters.date.replace(/\./g, "/").replace("/202", "/2")
      : "";
    const matchesDate = !filters.date || event.date === formattedFilterDate;

    const matchesPlace =
      !filters.location ||
      (event.location || event.place || "")
        .toLowerCase()
        .includes(filters.location.toLowerCase().trim());

    const matchesTime =
      (!filters.startTime || event.time >= filters.startTime) &&
      (!filters.endTime || event.time <= filters.endTime);

    return matchesCategory && matchesDate && matchesPlace && matchesTime;
  });

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

      <ContentPadding style={{ marginTop: "16px" }}>
        <FiltersContainer>
          <FilterWrapper onClick={() => setActiveModal("interests")}>
            <FilterButton>Интересы</FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper onClick={() => setActiveModal("date")}>
            <FilterButton>Дата</FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper onClick={() => setActiveModal("time")}>
            <FilterButton>Время</FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>

          <FilterWrapper onClick={() => setActiveModal("place")}>
            <FilterButton>Место</FilterButton>
            <OpenFilterIcon />
          </FilterWrapper>
        </FiltersContainer>

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
                    <Icon28CalendarOutline width={16} height={16} /> {event.date}
                  </DetailRow>
                  <DetailRow>
                    <Icon28ClockOutline width={16} height={16} /> {event.time}
                  </DetailRow>
                  <DetailRow>
                    <Icon28PlaceOutline width={16} height={16} /> {event.location || event.place}
                  </DetailRow>
                </DateContainer>
              </div>

              <ActionButton onClick={() => navigate(`/page-1/${event.id}`)}>
                Перейти к поводу
              </ActionButton>
            </EventInfo>
          </Card>
        ))}

        {filteredEvents.length === 0 && (
          <div style={{ textAlign: "center", color: "#818c99", marginTop: "20px" }}>
            Поводы не найдены
          </div>
        )}
      </ContentPadding>

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

      <TimeFilter
        isOpen={activeModal === "time"}
        onClose={() => setActiveModal(null)}
        onSave={handleApplyTime}
      />

      <LocationFilter
        isOpen={activeModal === "place"}
        onClose={() => setActiveModal(null)}
        onSave={handleApplyLocation}
      />

      <NavMenu />
    </PageContainer>
  );
}

export default observer(SignUpEventsPage);
