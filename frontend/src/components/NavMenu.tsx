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
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px 14px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--povod-border);
  }
`;

/** Метка логотипа — залитый квадрат с буквой, чтобы бренд не был голым текстом. */
const BrandMark = styled.span`
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--povod-primary);
  color: #fff;
  font-weight: 800;
  font-size: 17px;
  line-height: 1;
`;

const BrandName = styled.span`
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--povod-primary);
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
  position: relative;
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
    /* Строка на всю ширину панели: иконка + подпись + счётчик у правого края. */
    width: 100%;
    height: 46px;
    grid-template-columns: 24px 1fr auto;
    justify-items: start;
    align-items: center;
    gap: 14px;
    padding: 0 14px;
    border-radius: var(--povod-radius-md);
    font-size: 15px;
    font-weight: 500;
    transition:
      background 0.15s ease,
      color 0.15s ease;

    /* Наведение — лёгкая подсветка тем же акцентом, что и активный, но слабее. */
    &:hover {
      background: color-mix(in srgb, var(--povod-primary) 8%, transparent);
      color: var(--povod-text);
    }

    /* Активный раздел выразителен: акцентная заливка, цвет и жирнее шрифт.
       Плоский серый прямоугольник читался как «неактивно». */
    &.active {
      color: var(--povod-primary);
      font-weight: 600;
      background: color-mix(in srgb, var(--povod-primary) 14%, transparent);
    }
  }
`;

/**
 * Пункт «Создать» — акцентный: это главное действие продукта, а выглядел он
 * такой же серой вкладкой, как остальные, и терялся среди них.
 *
 *  - Телефон: залитый круг с плюсом в своей ячейке панели — без «прыгающего»
 *    FAB, сетка из четырёх пунктов не ломается.
 *  - Десктоп: строка залита акцентом целиком, текст — on-primary.
 *
 * Состояния — та же гамма, что у кнопок: hover → primary-hover, нажатие и
 * активный маршрут → primary-active.
 */
const CreateNavLink = styled(StyledNavLink)`
  .create-circle {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--povod-primary);
    color: var(--povod-on-primary);
    transition:
      background 0.15s ease,
      transform 0.1s ease;
  }

  &:hover .create-circle {
    background: var(--povod-primary-hover);
  }

  &:active .create-circle {
    background: var(--povod-primary-active);
    transform: scale(0.95);
  }

  &.active .create-circle {
    background: var(--povod-primary-active);
  }

  @media (min-width: ${DESKTOP}) {
    background: var(--povod-primary);
    color: var(--povod-on-primary);
    font-weight: 600;

    /* Круг растворяется в залитой строке — остаётся только иконка. */
    .create-circle,
    &:hover .create-circle,
    &:active .create-circle,
    &.active .create-circle {
      width: 24px;
      height: 24px;
      background: transparent;
      color: inherit;
      transform: none;
    }

    &:hover {
      background: var(--povod-primary-hover);
      color: var(--povod-on-primary);
    }

    &.active {
      background: var(--povod-primary-active);
      color: var(--povod-on-primary);
    }

    /* Кольцо фокуса — снаружи заливки, иначе синее на синем не видно. */
    &:focus-visible {
      outline-offset: 2px;
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

/**
 * Счётчик непрочитанных у пункта «Чаты». На телефоне (нижняя панель) он живёт
 * уголком на иконке — как раньше. На десктопе иконка стоит в узкой колонке
 * строки, и точка на ней читалась бы как случайная; поэтому там его прячем и
 * показываем `RowBadge` — счётчик у правого края строки, привычный по мессенджерам.
 */
const IconBadge = styled(UnreadBadge)`
  @media (min-width: ${DESKTOP}) {
    display: none;
  }
`;

/** Десктопный счётчик: третья колонка строки, прижат к правому краю. */
const RowBadge = styled.span`
  display: none;

  @media (min-width: ${DESKTOP}) {
    display: inline-grid;
    place-items: center;
    justify-self: end;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--povod-danger);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }
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
    gap: 6px;
    margin-top: 6px;
    padding-top: 10px;
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
  padding: 8px;
  border-radius: var(--povod-radius-md);
  cursor: pointer;
  color: var(--povod-text);
  text-align: left;
  transition: background 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--povod-primary) 8%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
  }
`;

const AvatarCircle = styled.span<{ $avatar?: string }>`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: var(--povod-surface-muted);
  background-image: ${(props) => (props.$avatar ? `url(${props.$avatar})` : "none")};
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--povod-text-secondary);
  text-transform: uppercase;
`;

/** Имя и подпись «Мой профиль» — двухстрочный блок, чтобы имя не висело в воздухе. */
const ProfileText = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
`;

const ProfileName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
`;

const ProfileHint = styled.span`
  font-size: 11px;
  color: var(--povod-text-secondary);
`;

const BellButton = styled.button`
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--povod-text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
  border-radius: var(--povod-radius-md);
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--povod-primary) 8%, transparent);
    color: var(--povod-primary);
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
      <Brand>
        <BrandMark aria-hidden="true">P</BrandMark>
        <BrandName>POVOD</BrandName>
      </Brand>

      <Nav aria-label="Основные разделы">
        <NavInner>
          {LINKS.map(({ to, label, Icon }) => {
            // «Создать» — акцентный пункт со своей вёрсткой: круг на телефоне,
            // залитая строка на десктопе. Позиция в ряду при этом общая.
            if (to === "/add") {
              return (
                <CreateNavLink key={to} to={to} aria-label={label}>
                  <span className="create-circle">
                    <Icon />
                  </span>
                  <Label>{label}</Label>
                </CreateNavLink>
              );
            }
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
                    <IconBadge aria-hidden="true">{unread > 99 ? "99+" : unread}</IconBadge>
                  )}
                </IconSlot>
                <Label>{label}</Label>
                {showBadge && (
                  <RowBadge aria-hidden="true">{unread > 99 ? "99+" : unread}</RowBadge>
                )}
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
          <ProfileText>
            <ProfileName>{user.name || "Профиль"}</ProfileName>
            <ProfileHint>Мой профиль</ProfileHint>
          </ProfileText>
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
