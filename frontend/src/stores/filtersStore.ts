import { makeAutoObservable } from "mobx";
import type { FilterOption } from "../components/Filters";
import { INTERESTS } from "../data/interests";

/**
 * Состояние фильтров ленты и «Моих событий».
 *
 * Раньше фильтры жили в `useState` внутри страниц, поэтому при уходе на другую
 * вкладку компонент размонтировался и выбор терялся. Здесь состояние вынесено в
 * стор, который переживает переходы между страницами.
 *
 * Наборы независимы: у ленты и «Моих событий» свои фильтры.
 */

/** Каталог для чипов фильтра. Метки — из единого списка (frontend/src/data/interests.ts). */
export const INTEREST_CATALOG: ReadonlyArray<{ id: string; label: string }> = INTERESTS.map(
  (label, index) => ({ id: String(index + 1), label }),
);

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

  /** Применяет состояние целиком — например, разобранное из ссылки (FE-006). */
  applyAll(next: {
    search: string;
    date: string;
    location: string;
    startTime: string;
    endTime: string;
    interestIds: string[];
  }): void {
    this.search = next.search;
    this.date = next.date;
    this.location = next.location;
    this.startTime = next.startTime;
    this.endTime = next.endTime;
    this.interestIds = [...next.interestIds];
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

/**
 * Вкладки раздела «Мои события» (FE-008, избранное — PROD-001).
 *
 * Вкладки «Все» не стало: она показывала объединение созданных и посещаемых, а
 * автор события автоматически становится его участником — то есть «Все» почти
 * всегда совпадали с «Посещаю» и место занимали зря.
 */
export type MyEventsTab = "attending" | "created" | "favorites";

class FiltersStore {
  /** Фильтры ленты (`/page-1`). */
  readonly feed = new FilterState();
  /** Фильтры раздела «Мои события» (`/events`). */
  readonly myEvents = new FilterState();
  /** Выбранная вкладка «Моих событий» — тоже переживает переходы между страницами. */
  myEventsTab: MyEventsTab = "attending";

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
    this.myEventsTab = "attending";
  }
}

export const filtersStore = new FiltersStore();
