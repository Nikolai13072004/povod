import { makeAutoObservable } from "mobx";
import type { FilterOption } from "../components/Filters";

/**
 * Состояние фильтров ленты и «Моих событий».
 *
 * Раньше фильтры жили в `useState` внутри страниц, поэтому при уходе на другую
 * вкладку компонент размонтировался и выбор терялся. Здесь состояние вынесено в
 * стор, который переживает переходы между страницами.
 *
 * Наборы независимы: у ленты и «Моих событий» свои фильтры.
 */

/** Единый каталог интересов (раньше список дублировался на обеих страницах). */
export const INTEREST_CATALOG: ReadonlyArray<{ id: string; label: string }> = [
  { id: "1", label: "Спорт" },
  { id: "2", label: "Искусство" },
  { id: "3", label: "Путешествия" },
  { id: "4", label: "IT" },
  { id: "5", label: "Компьютерные игры" },
  { id: "6", label: "Технологии" },
  { id: "7", label: "Еда" },
  { id: "8", label: "Настольные игры" },
  { id: "9", label: "Наука" },
  { id: "10", label: "Музыка" },
  { id: "11", label: "Саморазвитие" },
  { id: "12", label: "Образование" },
  { id: "13", label: "Кино" },
  { id: "14", label: "Шопинг" },
  { id: "15", label: "Ресторан" },
  { id: "16", label: "Музей" },
  { id: "17", label: "Отдых" },
];

export class FilterState {
  search = "";
  date = "";
  location = "";
  startTime = "";
  endTime = "";
  interestIds: string[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  /** Опции для модального окна интересов с отметками выбранных. */
  get interestOptions(): FilterOption[] {
    return INTEREST_CATALOG.map((interest) => ({
      ...interest,
      selected: this.interestIds.includes(interest.id),
    }));
  }

  /** Названия выбранных интересов — по ним фильтруются категории и теги. */
  get selectedInterests(): string[] {
    return INTEREST_CATALOG.filter((interest) => this.interestIds.includes(interest.id)).map(
      (interest) => interest.label,
    );
  }

  /** Диапазон времени учитывается, только когда заданы обе границы. */
  get timeActive(): boolean {
    return Boolean(this.startTime && this.endTime);
  }

  get hasActiveFilters(): boolean {
    return (
      Boolean(this.search.trim()) ||
      this.interestIds.length > 0 ||
      Boolean(this.date) ||
      Boolean(this.location) ||
      this.timeActive
    );
  }

  setSearch(value: string): void {
    this.search = value;
  }

  setDate(value: string): void {
    this.date = value;
  }

  setLocation(value: string): void {
    this.location = value;
  }

  setTimeRange(start: string, end: string): void {
    this.startTime = start;
    this.endTime = end;
  }

  toggleInterest(id: string): void {
    this.interestIds = this.interestIds.includes(id)
      ? this.interestIds.filter((item) => item !== id)
      : [...this.interestIds, id];
  }

  reset(): void {
    this.search = "";
    this.date = "";
    this.location = "";
    this.startTime = "";
    this.endTime = "";
    this.interestIds = [];
  }
}

/** Вкладки раздела «Мои события» (FE-008, избранное — PROD-001). */
export type MyEventsTab = "all" | "created" | "attending" | "favorites";

class FiltersStore {
  /** Фильтры ленты (`/page-1`). */
  readonly feed = new FilterState();
  /** Фильтры раздела «Мои события» (`/events`). */
  readonly myEvents = new FilterState();
  /** Выбранная вкладка «Моих событий» — тоже переживает переходы между страницами. */
  myEventsTab: MyEventsTab = "all";

  constructor() {
    makeAutoObservable(this);
  }

  setMyEventsTab(tab: MyEventsTab): void {
    this.myEventsTab = tab;
  }

  /** Сброс всего — используется при выходе из аккаунта. */
  resetAll(): void {
    this.feed.reset();
    this.myEvents.reset();
    this.myEventsTab = "all";
  }
}

export const filtersStore = new FiltersStore();
