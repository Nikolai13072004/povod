import { useEffect, useId, useState, type ReactNode } from "react";
import styled from "@emotion/styled";
import { Input } from "@vkontakte/vkui";
import { findCity, searchCities } from "../../data/cities";

/**
 * Выбор города из справочника (FE-025).
 *
 * Нативный `<datalist>` умел подсказывать, но не запрещал вписать произвольный
 * текст — «город» мог оказаться чем угодно. Здесь поле стремится к настоящему
 * городу: по мере ввода показываются подходящие, а на потерю фокуса ввод
 * нормализуется — точное совпадение приводится к каноническому написанию
 * («москва» → «Москва»), а произвольный текст, не совпавший ни с одним городом,
 * отбрасывается.
 *
 * `onChange` вызывается на каждый ввод (родитель всегда видит текущий текст) и
 * ещё раз при нормализации. Так значение доступно сразу, без ожидания blur, —
 * это важно там, где по кнопке рядом читают его синхронно (онбординг).
 */

const Wrapper = styled.div`
  position: relative;
`;

const Dropdown = styled.ul`
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--povod-surface);
  border: 1px solid var(--povod-border-strong);
  border-radius: var(--povod-radius-md);
  box-shadow: var(--povod-shadow-card);
  max-height: 240px;
  overflow-y: auto;
`;

const Option = styled.li<{ $active: boolean }>`
  padding: 10px 12px;
  border-radius: var(--povod-radius-sm);
  font-size: 15px;
  color: var(--povod-text);
  cursor: pointer;
  background: ${({ $active }) =>
    $active ? "color-mix(in srgb, var(--povod-primary) 12%, transparent)" : "transparent"};

  &:hover {
    background: color-mix(in srgb, var(--povod-primary) 8%, transparent);
  }
`;

const Hint = styled.div`
  margin-top: 6px;
  font-size: 12px;
  color: var(--povod-text-secondary);
`;

interface CityAutocompleteProps {
  value: string;
  /** Текущий текст на каждый ввод; при нормализации — город из списка или "". */
  onChange: (city: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Иконка слева (например, «место») — прокидывается в VKUI Input. */
  before?: ReactNode;
}

export function CityAutocomplete({
  value,
  onChange,
  placeholder = "Город",
  ariaLabel,
  before,
}: CityAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  // Значение управляется родителем; фокус нужен, только чтобы решать, показывать
  // ли выпадашку. Список подсказок пересобирается из текущего `value`.
  const suggestions = focused ? searchCities(value) : [];
  const invalid = value.trim() !== "" && !findCity(value);

  useEffect(() => {
    if (active >= suggestions.length) setActive(-1);
  }, [suggestions.length, active]);

  const choose = (city: string) => {
    onChange(city);
    setActive(-1);
    setFocused(false);
  };

  /** Приводит поле к валидному: канонический город либо пустая строка. */
  const settle = () => {
    const match = findCity(value);
    if (match) onChange(match);
    else if (value.trim() !== "") onChange("");
    setFocused(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocused(true);
      setActive((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      if (active >= 0 && suggestions[active]) {
        event.preventDefault();
        choose(suggestions[active]);
      } else {
        settle();
      }
    } else if (event.key === "Escape") {
      setFocused(false);
      setActive(-1);
    }
  };

  return (
    <Wrapper>
      <Input
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={focused && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        before={before}
        onFocus={() => {
          setFocused(true);
          setActive(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setFocused(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        // Нормализуем на blur. Клик по подсказке гасит blur через preventDefault
        // на mousedown, поэтому выбор из списка сюда не попадает и не теряется.
        onBlur={settle}
      />
      {focused && suggestions.length > 0 && (
        <Dropdown id={listId} role="listbox">
          {suggestions.map((city, index) => (
            <Option
              key={city}
              role="option"
              aria-selected={index === active}
              $active={index === active}
              onMouseDown={(event) => {
                // До blur: иначе settle() успел бы отбросить выбор как «не город».
                event.preventDefault();
                choose(city);
              }}
            >
              {city}
            </Option>
          ))}
        </Dropdown>
      )}
      {focused && invalid && suggestions.length === 0 && (
        <Hint>Такого города нет в списке — выберите из подсказок</Hint>
      )}
    </Wrapper>
  );
}
