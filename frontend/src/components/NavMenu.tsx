import { NavLink, useNavigate } from "react-router-dom";
import styled from "@emotion/styled";
import { observer } from "mobx-react-lite";
import "../index.css";
import { HomeIcon, AddIcon, EventIcon, ChatIcon, BellIcon } from "../icons/icons";
import { chatStore } from "../stores/chatStore";
import { notificationsStore } from "../stores/notificationsStore";
import { sessionStore } from "../stores/sessionStore";

/**
 * Навигация приложения (UX-007, UX-014).
 *
 * Два непохожих облика по ширине экрана, поэтому — два набора правил, а не одно
 * растянутое меню:
 *
 *  - Телефон: привычная панель снизу, у большого пальца. Только иконки.
 *  - Десктоп: боковая панель слева. Бренд сверху, вертикальный список разделов
 *    с подписями, а профиль и колокольчик — внизу, у самого края макета.
 *    Верхняя шапка на десктопе прячется (см. Header): её место занимает эта
 *    панель, и серая полоса сверху уходит.
 *
 * Пункты меню — один массив `LINKS`: активный раздел не теряется при смене
 * ширины, потому что подсветка идёт по маршруту, а не по дереву.
 */

/** Ширина, с которой снизу тянуться мышью уже неудобно — переходим на боковую. */
const DESKTOP = "900px";

const NavWrapper = styled.div`
  position: fixed;
  z-index: 100;
  background: var(--povod-surface);
  /* Ширина панели на десктопе задаётся токеном и обязана включать её отступы и
     границу — тем же значением сдвинут контент в App.tsx, иначе панель на
     несколько пикселей залезет под него. */
  box-sizing: border-box;

  /* Телефон: панель снизу во всю ширину. */
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
  border-top: 1px solid var(--povod-border);
  padding-bottom: env(safe-area-inset-bottom, 0px);

  @media (min-width: ${DESKTOP}) {
    /* Десктоп: колонка слева во всю высоту. */
    top: 0;
    bottom: 0;
    right: auto;
    width: var(--povod-sidebar-width, 240px);
    flex-direction: column;
    justify-content: flex-start;
    box-shadow: none;
    border-top: none;
    border-right: 1px solid var(--povod-border);
    padding: 20px 12px;
    gap: 8px;
  }
`;

/** Логотип виден только на десктопе — на телефоне его место в верхней шапке. */
const Brand = styled.div`
  display: none;

  @media (min-width: ${DESKTOP}) {
    display: block;
    padding: 8px 12px 16px;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--povod-primary);
  }
`;

const Nav = styled.nav`
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: var(--povod-content-max, 1080px);
  margin: 0 auto;
  padding: 8px 10px;

  @media (min-width: ${DESKTOP}) {
    flex-direction: column;
    max-width: none;
    margin: 0;
    padding: 0;
    gap: 4px;
  }
`;

const NavInner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  max-width: 480px;

  @media (min-width: ${DESKTOP}) {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    max-width: none;
  }
`;

const StyledNavLink = styled(NavLink)`
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
    /* Строка на всю ширину панели: иконка + подпись, активный — залит. */
    width: 100%;
    height: 44px;
    grid-auto-flow: column;
    grid-template-columns: 24px 1fr;
    justify-items: start;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    border-radius: var(--povod-radius-sm);
    font-size: 15px;

    &:hover {
      background: var(--povod-surface-muted);
    }

    &.active {
      color: var(--povod-primary);
      background: var(--povod-surface-muted);
    }
  }
`;

/** Подпись видна только на широком экране: в нижней панели для неё нет места. */
const Label = styled.span`
  display: none;

  @media (min-width: ${DESKTOP}) {
    display: inline;
  }
`;

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

/** Разделитель между разделами и нижним блоком профиля — только на десктопе. */
const Spacer = styled.div`
  display: none;

  @media (min-width: ${DESKTOP}) {
    display: block;
    flex: 1;
  }
`;

/** Профиль и колокольчик у нижнего края панели. Только десктоп. */
const BottomBlock = styled.div`
  display: none;

  @media (min-width: ${DESKTOP}) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 0;
    border-top: 1px solid var(--povod-border);
  }
`;

const ProfileButton = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 6px;
  border-radius: var(--povod-radius-sm);
  cursor: pointer;
  color: var(--povod-text);
  text-align: left;

  &:hover {
    background: var(--povod-surface-muted);
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
  }
`;

const AvatarCircle = styled.span<{ $avatar?: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: var(--povod-surface-muted);
  background-image: ${(props) => (props.$avatar ? `url(${props.$avatar})` : "none")};
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--povod-text-secondary);
  text-transform: uppercase;
`;

const ProfileName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
`;

const BellButton = styled.button`
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--povod-text-accent, var(--povod-primary));
  display: grid;
  place-items: center;
  cursor: pointer;
  border-radius: var(--povod-radius-sm);

  &:hover {
    background: var(--povod-surface-muted);
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
  }
`;

const LINKS = [
  { to: "/page-1", label: "Главная", Icon: HomeIcon },
  { to: "/add", label: "Создать", Icon: AddIcon },
  { to: "/events", label: "Мои события", Icon: EventIcon },
  { to: "/chats", label: "Чаты", Icon: ChatIcon },
];

function NavMenu() {
  const navigate = useNavigate();
  const unread = chatStore.unread;
  const notifications = notificationsStore.unread;
  const user = sessionStore.user;

  return (
    <NavWrapper>
      <Brand>POVOD</Brand>

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

      <Spacer />

      {/* Профиль и колокольчик у края панели — на телефоне они в верхней шапке. */}
      <BottomBlock>
        <ProfileButton type="button" onClick={() => navigate("/Profile")} aria-label="Мой профиль">
          <AvatarCircle $avatar={user.avatar}>{user.name?.[0]}</AvatarCircle>
          <ProfileName>{user.name || "Профиль"}</ProfileName>
        </ProfileButton>
        <BellButton
          type="button"
          onClick={() => navigate("/notifications")}
          aria-label={notifications > 0 ? `Уведомления, ${notifications} новых` : "Уведомления"}
        >
          <BellIcon />
          {notifications > 0 && (
            <UnreadBadge aria-hidden="true">
              {notifications > 99 ? "99+" : notifications}
            </UnreadBadge>
          )}
        </BellButton>
      </BottomBlock>
    </NavWrapper>
  );
}

export default observer(NavMenu);
