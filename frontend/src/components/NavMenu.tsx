import { NavLink } from "react-router-dom";
import styled from "@emotion/styled";
import { observer } from "mobx-react-lite";
import "../index.css";
import { HomeIcon, AddIcon, EventIcon, ChatIcon } from "../icons/icons";
import { chatStore } from "../stores/chatStore";

/**
 * Навигация приложения (UX-007).
 *
 * На телефоне — привычная панель снизу, у большого пальца. На широком экране
 * она же растягивалась во всю ширину: четыре иконки в пустой полосе внизу
 * страницы, куда на десктопе никто не тянется мышью. Поэтому от 900px панель
 * превращается в горизонтальный ряд с подписями наверху колонки контента.
 *
 * Разметка одна и та же — меняются только правила расположения, чтобы не
 * поддерживать два дерева и не терять активное состояние при смене ширины.
 */

const shouldForwardProp = (prop: string) => prop !== "$mode";

/** Ширина, с которой снизу тянуться мышью уже неудобно. */
const DESKTOP = "900px";

const NavWrapper = styled("div", { shouldForwardProp })`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  z-index: 100;
  display: flex;
  justify-content: center;
  background: transparent;

  @media (min-width: ${DESKTOP}) {
    position: static;
    justify-content: flex-start;
  }
`;

const Nav = styled("nav", { shouldForwardProp })`
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: var(--povod-content-max, 1080px);
  margin: 0 auto;
  height: 60px;
  padding: 0 10px 20px 10px;
  background: var(--povod-surface);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
  border-top: 2px solid var(--povod-border-strong);

  @media (min-width: ${DESKTOP}) {
    height: auto;
    padding: 0 16px;
    background: transparent;
    box-shadow: none;
    border-top: none;
    /*
     * Разделителя нет: на широком экране ряд навигации и так отделён отступом,
     * а линия под ним читалась как обрубок таблицы. Активный раздел различим
     * по цвету и подчёркиванию самой ссылки.
     */
    justify-content: flex-start;
  }
`;

const NavInner = styled("div", { shouldForwardProp })`
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  max-width: 480px;

  @media (min-width: ${DESKTOP}) {
    justify-content: flex-start;
    gap: 4px;
    max-width: none;
  }
`;

const StyledNavLink = styled(NavLink, { shouldForwardProp })`
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  background: transparent;
  text-decoration: none;
  transition: color 0.2s ease;

  color: var(--povod-text-secondary);

  &.active {
    color: var(--povod-primary);
  }

  &:hover {
    color: var(--povod-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: -4px;
    border-radius: var(--povod-radius-sm);
  }

  @media (min-width: ${DESKTOP}) {
    width: auto;
    height: 48px;
    grid-auto-flow: column;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-radius: var(--povod-radius-sm);
    font-size: 15px;

    &:hover {
      background: var(--povod-surface-muted);
    }

    /* Активный раздел подчёркнут: цвета иконки на широком экране мало. */
    &.active {
      box-shadow: inset 0 -2px 0 var(--povod-primary);
    }
  }
`;

/** Подпись видна только на широком экране: внизу для неё нет места. */
const Label = styled.span`
  display: none;

  @media (min-width: ${DESKTOP}) {
    display: inline;
  }
`;

/**
 * Значок непрочитанных на вкладке «Чаты».
 *
 * Иконка занимает место целиком, поэтому счётчик садится ей на угол —
 * `position: absolute` внутри ссылки, которая для этого стала `relative`.
 */
const IconSlot = styled.span`
  position: relative;
  display: grid;
  place-items: center;
`;

const UnreadBadge = styled.span`
  position: absolute;
  top: -4px;
  right: -8px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--povod-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
`;

const LINKS = [
  { to: "/page-1", label: "Главная", Icon: HomeIcon },
  { to: "/add", label: "Создать", Icon: AddIcon },
  { to: "/events", label: "Мои события", Icon: EventIcon },
  { to: "/chats", label: "Чаты", Icon: ChatIcon },
];

function NavMenu() {
  const unread = chatStore.unread;

  return (
    <NavWrapper>
      <Nav aria-label="Основные разделы">
        <NavInner>
          {LINKS.map(({ to, label, Icon }) => {
            const showBadge = to === "/chats" && unread > 0;
            return (
              <StyledNavLink
                key={to}
                to={to}
                aria-label={showBadge ? `${label}, ${unread} непрочитанных` : label}
              >
                <IconSlot>
                  <Icon />
                  {showBadge && (
                    <UnreadBadge aria-hidden="true">{unread > 99 ? "99+" : unread}</UnreadBadge>
                  )}
                </IconSlot>
                <Label>{label}</Label>
              </StyledNavLink>
            );
          })}
        </NavInner>
      </Nav>
    </NavWrapper>
  );
}

export default observer(NavMenu);
