import { useEffect, useRef, useState } from "react";
import {
  Group,
  SimpleCell,
  Switch,
  Avatar,
  Chip,
  ModalRoot,
  ModalPage,
  ModalPageHeader,
  ModalDismissButton,
  Button,
} from "@vkontakte/vkui";
import { Icon28CancelOutline, Icon20PlaceOutline, Icon24AddOutline } from "@vkontakte/icons";
import { CityDatalist, CITY_DATALIST_ID } from "../../components/CityDatalist/CityDatalist";
import styled from "@emotion/styled";
import "@vkontakte/vkui/dist/vkui.css";
import { useNavigate } from "react-router-dom";
import { usersAPI } from "../../services/api";
import { sessionStore } from "../../stores/sessionStore";
import { observer } from "mobx-react-lite";
import bridge from "@vkontakte/vk-bridge";
import { getStoredInterests, setStoredInterests } from "../../storage";
import { useTheme } from "../../context/ThemeContext";
import { INTERESTS } from "../../data/interests";
import {
  ACCEPTED_IMAGE_TYPES,
  AVATAR_RESIZE,
  describeUnsupportedImage,
  resizeImageToDataUrl,
} from "../../utils/imageResize";
import { FriendRequests } from "./FriendRequests";

const PageRoot = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 90vh;
  background: transparent;
  box-sizing: border-box;
`;
const ContentWrapper = styled.div`
  flex-grow: 1;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
`;

const ProfileTitle = styled.h1`
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  color: var(--vkui--color_text_primary);
`;

const CloseButton = styled.button`
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  padding: 6px;
  margin: 0;
  cursor: pointer;
  line-height: 0;
  color: var(--povod-primary);

  svg {
    fill: currentColor;
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: 2px;
    border-radius: var(--povod-radius-xs);
  }
`;

const ProfileWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px 20px;
  background: transparent;
`;

/** Кнопка смены фото прижата к краю самой аватарки — там её и ищут. */
const AvatarSlot = styled.div`
  position: relative;
  line-height: 0;
`;

const AvatarButton = styled.button`
  position: absolute;
  right: -2px;
  bottom: -2px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 2px solid var(--povod-surface);
  border-radius: 50%;
  background: var(--povod-primary);
  color: var(--povod-on-primary);
  cursor: pointer;
  padding: 0;

  svg {
    fill: currentColor;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: 2px;
  }
`;

const AvatarReset = styled.button`
  margin-top: 8px;
  border: none;
  background: none;
  padding: 4px 8px;
  color: var(--povod-text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: 2px;
  }
`;

const UserName = styled.h2`
  margin: 12px 0 4px;
  font-size: 19px;
  font-weight: 600;
  color: var(--vkui--color_text_primary);
`;

/** Город кликабелен: открывает редактирование (FE-009). */
const CityButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  min-height: 32px;
  border: none;
  background: none;
  color: var(--vkui--color_text_secondary, var(--povod-text-secondary));
  font: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: 2px;
  }
`;

const InterestsHeading = styled.h2`
  margin: 0;
  padding: 0 16px 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--vkui--color_text_primary);
`;

/** Заголовок и выход к списку людей в одной строке. */
const FriendsHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-right: 12px;
`;

const FriendCard = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 72px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--povod-primary);
    outline-offset: 2px;
    border-radius: var(--povod-radius-sm);
  }
`;

const FriendName = styled.span`
  font-size: 12px;
  text-align: center;
  color: var(--vkui--color_text_primary);
`;

const ChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 16px;
`;

const StyledChip = styled(Chip)`
  background-color: var(--povod-primary) !important;
  & .vkuiChip__content {
    color: var(--povod-on-primary) !important;
  }

  &[data-type="add"] {
    background-color: transparent !important;
    border: 1px solid var(--povod-border-strong);

    & .vkuiChip__content {
      color: var(--povod-text-secondary) !important;
    }
  }
`;

/**
 * Выход — настоящая кнопка с обводкой.
 *
 * Был просто текст в `div`: без рамки он не читался как нажимаемый, а с
 * клавиатуры до него было не добраться вовсе — `div` не попадает в порядок
 * обхода и не срабатывает по Enter.
 */
const LogoutButton = styled.button`
  display: block;
  margin: 24px auto 32px;
  padding: 12px 32px;
  border: 1px solid var(--povod-danger);
  border-radius: var(--povod-radius-xl);
  background: transparent;
  color: var(--povod-danger);
  font: inherit;
  font-weight: 500;
  font-size: 16px;
  cursor: pointer;

  &:hover {
    background: var(--povod-danger-on-surface, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--povod-danger);
    outline-offset: 2px;
  }
`;

const BrightSwitchScope = styled.div`
  --vkui--color_background_accent: var(--povod-primary);
  --vkui--color_background_accent--hover: var(--povod-primary);
  --vkui--color_background_accent--active: var(--povod-primary-hover);
  --vkui--color_background_accent_themed: var(--povod-primary);
  --vkui--color_background_accent_themed--hover: var(--povod-primary);
  --vkui--color_background_accent_themed--active: var(--povod-primary-hover);
  --vkui--color_icon_accent: var(--povod-primary);
  --vkui--color_icon_accent_themed: var(--povod-primary);

  .vkuiSimpleCell {
    background: transparent !important;
  }
`;

const AllInterestsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px;
`;

const InterestChip = styled.button<{ $selected?: boolean }>`
  padding: 8px 16px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid
    ${(props) => (props.$selected ? "var(--povod-primary)" : "var(--povod-border-strong)")};
  border-radius: var(--povod-radius-lg);
  background: ${(props) => (props.$selected ? "var(--povod-primary)" : "transparent")};
  color: ${(props) => (props.$selected ? "var(--povod-on-primary)" : "var(--povod-text-secondary)")};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:active {
    opacity: 0.8;
  }
`;

const UserProfile = () => {
  const { theme, preference, toggleTheme, setPreference } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [invitations, setInvitations] = useState(true);
  const [interests, setInterests] = useState<string[]>([]);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedNewInterests, setSelectedNewInterests] = useState<string[]>([]);
  const navigate = useNavigate();

  const [friends, setFriends] = useState<{ id: string; name: string; avatar?: string }[]>([]);
  const [city, setCity] = useState("");
  const [cityEditing, setCityEditing] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  /**
   * Смена фото профиля.
   *
   * Картинка уменьшается в браузере до 256×256 перед отправкой. Так снимок с
   * телефона вообще проходит (иначе он не влезал в лимит сервера), и, что
   * важнее, аватарка едет в каждом ответе, где встречается её владелец — в
   * списке комментариев, в списке участников. Несжатая она раздувала бы их все.
   */
  const saveAvatar = async (avatar: string) => {
    setAvatarBusy(true);
    setProfileError(null);
    const saved = await sessionStore.updateProfile({ avatar });
    setAvatarBusy(false);
    if (!saved) setProfileError(sessionStore.error ?? "Не удалось сохранить фото");
  };

  const handleAvatarPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Сбрасываем сразу: иначе повторный выбор того же файла не даст события.
    event.target.value = "";
    if (!file) return;

    const unsupported = describeUnsupportedImage(file);
    if (unsupported) {
      setProfileError(unsupported);
      return;
    }

    setAvatarBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, AVATAR_RESIZE);
      setAvatarBusy(false);
      await saveAvatar(dataUrl);
    } catch (error) {
      setAvatarBusy(false);
      setProfileError(error instanceof Error ? error.message : "Не удалось обработать изображение");
    }
  };

  useEffect(() => {
    /*
     * Источник правды — профиль на сервере, localStorage только кэш для первого
     * кадра. Раньше было наоборот, и это стирало данные: с другого компьютера
     * (где localStorage пуст) список открывался пустым, добавление одного
     * интереса слало `PUT` с массивом из одного элемента, а сервер заменяет
     * массив целиком — прежние интересы исчезали навсегда. С городом то же:
     * поле открывалось пустым и «Сохранить» записывало пустую строку.
     */
    const serverInterests = sessionStore.user.interests;
    setInterests(
      serverInterests?.length ? serverInterests : getStoredInterests(sessionStore.user.id),
    );
    setCity(sessionStore.user.city ?? sessionStore.city ?? "");

    // Друзья: внутри ВК — настоящие из ВКонтакте; в браузере — из бэкенда (демо)
    if (sessionStore.isVK) {
      loadVkFriends();
    } else {
      void loadFriends();
    }
    // Пересинхронизация при смене пользователя: иначе после выхода и входа под
    // другим аккаунтом на экране остались бы чужие интересы и город.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStore.user.id]);

  const loadFriends = async () => {
    const res = await usersAPI.getFriends(sessionStore.user.id);
    if (res.data) setFriends(res.data);
  };

  const loadVkFriends = async () => {
    try {
      const tokenRes = (await bridge.send("VKWebAppGetAuthToken", {
        app_id: 54645823,
        scope: "friends",
      })) as { access_token?: string };
      const token = tokenRes.access_token;
      if (!token) return;

      // Город через users.get (надёжнее, чем VKWebAppGetUserInfo)
      try {
        const ures = (await bridge.send("VKWebAppCallAPIMethod", {
          method: "users.get",
          params: { access_token: token, v: "5.131", fields: "city" },
        })) as { response?: Array<{ city?: { title?: string } }> };
        const c = ures.response?.[0]?.city?.title;
        if (c) setCity(c);
      } catch {
        /* город не получили — не критично */
      }

      const apiRes = (await bridge.send("VKWebAppCallAPIMethod", {
        method: "friends.get",
        params: {
          access_token: token,
          v: "5.131",
          fields: "photo_100",
          count: 50,
          order: "hints",
        },
      })) as {
        response?: {
          items?: Array<{
            id: number;
            first_name?: string;
            last_name?: string;
            photo_100?: string;
          }>;
        };
      };
      const items = apiRes.response?.items ?? [];
      setFriends(
        items.map((f) => ({
          id: String(f.id),
          name: [f.first_name, f.last_name].filter(Boolean).join(" "),
          avatar: f.photo_100,
        })),
      );
    } catch {
      /* пользователь отклонил доступ к друзьям или ошибка — оставляем пусто */
    }
  };

  const allAvailableInterests = INTERESTS;

  const handleCloseProfile = () => {
    navigate(-1);
  };

  const handleExit = async () => {
    await sessionStore.logout();
    localStorage.removeItem("isAuth");
    /*
     * Флаг `onboarded` намеренно НЕ стираем. Он лишь подсказка для первого
     * кадра: настоящий признак — интересы в профиле на сервере. Стирание
     * гнало вошедшего заново на экран интересов, тот открывался пустым, и
     * «Продолжить» затирал сохранённый выбор.
     */
    navigate("/", { replace: true });
  };

  const handleShowInterests = () => {
    setActiveModal("interests");
    setSelectedNewInterests([]);
  };

  const toggleInterestSelection = (interest: string) => {
    setSelectedNewInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  };

  /** Интересы сохраняются на сервере (FE-009), локальный список — только кэш для мгновенного отклика. */
  const handleAddInterests = async () => {
    const next = [...interests, ...selectedNewInterests.filter((i) => !interests.includes(i))];
    setInterests(next);
    setStoredInterests(sessionStore.user.id, next);
    setActiveModal(null);
    setSelectedNewInterests([]);

    const saved = await sessionStore.updateProfile({ interests: next });
    if (!saved) setProfileError(sessionStore.error ?? "Не удалось сохранить интересы");
  };

  /** Сохранение города вручную (раньше он брался из VK и никуда не записывался). */
  const handleSaveCity = async () => {
    setProfileError(null);
    const saved = await sessionStore.updateProfile({ city: city.trim() });
    if (saved) setCityEditing(false);
    else setProfileError(sessionStore.error ?? "Не удалось сохранить город");
  };

  return (
    <PageRoot>
      <ContentWrapper>
        <TopBar>
          <ProfileTitle>Мой профиль</ProfileTitle>
          <CloseButton type="button" aria-label="Закрыть" onClick={handleCloseProfile}>
            <Icon28CancelOutline />
          </CloseButton>
        </TopBar>

        <Group mode="plain" padding="s">
          <ProfileWrapper>
            <AvatarSlot>
              <Avatar
                size={96}
                src={sessionStore.user.avatar}
                initials={sessionStore.user.name?.[0]}
              />
              <AvatarButton
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarBusy}
                aria-label="Сменить фото профиля"
                title="Сменить фото профиля"
              >
                {avatarBusy ? "…" : <Icon24AddOutline width={18} height={18} />}
              </AvatarButton>
              <input
                ref={avatarInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                hidden
                onChange={(event) => void handleAvatarPick(event)}
              />
            </AvatarSlot>
            {sessionStore.user.avatar && (
              <AvatarReset type="button" onClick={() => void saveAvatar("")} disabled={avatarBusy}>
                Убрать фото
              </AvatarReset>
            )}
            <UserName>{sessionStore.user.name}</UserName>
            {cityEditing ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  aria-label="Город"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ваш город"
                  list={CITY_DATALIST_ID}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--povod-radius-sm)",
                    border: "1px solid var(--povod-border-strong)",
                    minWidth: 0,
                  }}
                />
                <Button size="s" mode="primary" onClick={handleSaveCity}>
                  Сохранить
                </Button>
                <Button size="s" mode="secondary" onClick={() => setCityEditing(false)}>
                  Отмена
                </Button>
                <CityDatalist />
              </div>
            ) : (
              <CityButton
                type="button"
                onClick={() => setCityEditing(true)}
                aria-label={city || sessionStore.city ? "Изменить город" : "Указать город"}
              >
                <Icon20PlaceOutline width={16} height={16} />
                {city || sessionStore.city || "Указать город"}
              </CityButton>
            )}
            {profileError && (
              <div
                role="alert"
                style={{ color: "var(--povod-danger)", fontSize: 13, marginTop: 6 }}
              >
                {profileError}
              </div>
            )}
          </ProfileWrapper>

          <InterestsHeading>Мои интересы</InterestsHeading>
          <ChipsContainer>
            {interests.map((item) => (
              <StyledChip key={item} removable={false}>
                {item}
              </StyledChip>
            ))}
            <StyledChip
              data-type="add"
              removable={false}
              after={<Icon24AddOutline width={16} height={16} />}
              onClick={handleShowInterests}
            >
              Добавить
            </StyledChip>
          </ChipsContainer>

          <ModalRoot activeModal={activeModal} onClose={() => setActiveModal(null)}>
            <ModalPage id="interests" onClose={() => setActiveModal(null)}>
              <ModalPageHeader before={<ModalDismissButton onClick={() => setActiveModal(null)} />}>
                Выбрать интересы
              </ModalPageHeader>
              <div style={{ padding: "16px" }}>
                <AllInterestsGrid>
                  {allAvailableInterests.map((interest) => (
                    <InterestChip
                      key={interest}
                      $selected={selectedNewInterests.includes(interest)}
                      onClick={() => toggleInterestSelection(interest)}
                    >
                      {interest}
                    </InterestChip>
                  ))}
                </AllInterestsGrid>
                {/* <Chip
                  onClick={handleAddInterests}
                  style={{
                    width: "calc(100% - 32px)",
                    margin: "16px",
                    background: "var(--povod-primary)",
                  }}
                >
                  Добавить ({selectedNewInterests.length})
                </Chip> */}
                <Chip
                  onClick={handleAddInterests}
                  style={{
                    width: "calc(100% - 32px)",
                    margin: "16px",
                    background: "var(--povod-primary)",
                    display: "flex",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      flexGrow: 1,
                      textAlign: "center",
                      paddingLeft: "24px",
                      color: "var(--povod-on-primary)",
                    }}
                  >
                    Добавить ({selectedNewInterests.length})
                  </span>
                </Chip>
              </div>
            </ModalPage>
          </ModalRoot>

          {/* Заявки идут выше списка: на них надо ответить, а список — справка. */}
          <FriendRequests userId={sessionStore.user.id} onAccepted={() => void loadFriends()} />

          <FriendsHeader>
            <InterestsHeading>Друзья ({friends.length})</InterestsHeading>
            {/*
              Единственный путь к чужому профилю раньше вёл через автора
              события: человека, не создавшего ни одного повода, нельзя было
              найти вообще — ни подружиться, ни написать (PROD-012).
            */}
            <Button mode="tertiary" size="s" onClick={() => navigate("/users")}>
              Найти людей
            </Button>
          </FriendsHeader>
          <ChipsContainer style={{ gap: 16 }}>
            {friends.map((f) => (
              // Кнопка, а не div: карточки друзей никуда не вели, хотя выглядели
              // кликабельными, и переписка с ними открывалась только в обход.
              <FriendCard
                key={f.id}
                type="button"
                onClick={() => navigate(`/users/${f.id}`)}
                aria-label={`Профиль: ${f.name}`}
              >
                <Avatar size={56} src={f.avatar} initials={f.name?.[0]} />
                <FriendName>{f.name}</FriendName>
              </FriendCard>
            ))}
            {friends.length === 0 && (
              <span style={{ color: "var(--vkui--color_text_secondary)", fontSize: 14 }}>
                Пока нет друзей
              </span>
            )}
          </ChipsContainer>

          <BrightSwitchScope>
            <SimpleCell
              after={
                <Switch checked={notifications} onChange={() => setNotifications(!notifications)} />
              }
            >
              Уведомления
            </SimpleCell>
            <SimpleCell
              after={<Switch checked={invitations} onChange={() => setInvitations(!invitations)} />}
            >
              Приглашения на события
            </SimpleCell>

            {/* Переключатель темы (UX-001): раньше тёмная тема существовала только в коде. */}
            <SimpleCell
              after={
                <Switch
                  checked={theme === "dark"}
                  onChange={toggleTheme}
                  aria-label="Тёмная тема"
                />
              }
              subtitle={preference === "system" ? "Сейчас как в системе" : "Выбрано вручную"}
            >
              Тёмная тема
            </SimpleCell>
            {preference !== "system" && (
              <SimpleCell onClick={() => setPreference("system")}>
                Следовать настройке системы
              </SimpleCell>
            )}
          </BrightSwitchScope>
        </Group>
      </ContentWrapper>

      <LogoutButton type="button" onClick={handleExit}>
        Выйти
      </LogoutButton>
    </PageRoot>
  );
};

export default observer(UserProfile);
