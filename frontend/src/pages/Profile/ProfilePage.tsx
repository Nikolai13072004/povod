import { useState, useEffect } from "react";
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
} from "@vkontakte/vkui";
import { Icon28CancelOutline, Icon20PlaceOutline, Icon24AddOutline } from "@vkontakte/icons";
import styled from "@emotion/styled";
import "@vkontakte/vkui/dist/vkui.css";
import { useNavigate } from "react-router-dom";
import { usersAPI } from "../../services/api";
import { sessionStore } from "../../stores/sessionStore";
import { observer } from "mobx-react-lite";
import bridge from "@vkontakte/vk-bridge";
import { getStoredInterests, setStoredInterests } from "../../storage";

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
  color: #2688eb;

  svg {
    fill: currentColor;
  }

  &:focus-visible {
    outline: 2px solid #2688eb;
    outline-offset: 2px;
    border-radius: 8px;
  }
`;

const ProfileWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px 20px;
  background: transparent;
`;

const UserName = styled.h2`
  margin: 12px 0 4px;
  font-size: 19px;
  font-weight: 600;
  color: var(--vkui--color_text_primary);
`;

const LocationWrapper = styled.div`
  display: flex;
  align-items: center;
  color: var(--vkui--color_text_secondary);
  font-size: 14px;
  gap: 4px;
`;

const InterestsHeading = styled.h2`
  margin: 0;
  padding: 0 16px 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--vkui--color_text_primary);
`;

const ChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 16px;
`;

const StyledChip = styled(Chip)`
  background-color: #2688eb !important;
  & .vkuiChip__content {
    color: #ffffff !important;
  }

  &[data-type="add"] {
    background-color: transparent !important;
    border: 1px solid #d7d8d9;

    & .vkuiChip__content {
      color: #99a2ad !important;
    }
  }
`;

const LogoutButton = styled.div`
  color: #e64646;
  font-weight: 500;
  font-size: 16px;
  background: transparent;
  text-align: center;
  padding: 24px 16px 32px;
  cursor: pointer;
`;

const BrightSwitchScope = styled.div`
  --vkui--color_background_accent: #2688eb;
  --vkui--color_background_accent--hover: #1e7ad4;
  --vkui--color_background_accent--active: #1a6bc4;
  --vkui--color_background_accent_themed: #2688eb;
  --vkui--color_background_accent_themed--hover: #1e7ad4;
  --vkui--color_background_accent_themed--active: #1a6bc4;
  --vkui--color_icon_accent: #2688eb;
  --vkui--color_icon_accent_themed: #2688eb;

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
  border: 1px solid ${(props) => (props.$selected ? "#2688eb" : "#d7d8d9")};
  border-radius: 20px;
  background: ${(props) => (props.$selected ? "#2688eb" : "transparent")};
  color: ${(props) => (props.$selected ? "#ffffff" : "#818c99")};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:active {
    opacity: 0.8;
  }
`;

const UserProfile = () => {
  const [notifications, setNotifications] = useState(true);
  const [invitations, setInvitations] = useState(true);
  const [interests, setInterests] = useState<string[]>([]);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedNewInterests, setSelectedNewInterests] = useState<string[]>([]);
  const navigate = useNavigate();

  const [friends, setFriends] = useState<{ id: string; name: string; avatar?: string }[]>([]);
  const [city, setCity] = useState("");

  useEffect(() => {
    // Реальные интересы пользователя (его выбор) — из локального хранилища
    setInterests(getStoredInterests(sessionStore.user.id));

    // Друзья: внутри ВК — настоящие из ВКонтакте; в браузере — из бэкенда (демо)
    if (sessionStore.isVK) {
      loadVkFriends();
    } else {
      usersAPI.getFriends(sessionStore.user.id).then((res) => {
        if (res.data) setFriends(res.data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          items?: Array<{ id: number; first_name?: string; last_name?: string; photo_100?: string }>;
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

  const allAvailableInterests = [
    "Спорт",
    "Искусство",
    "Путешествие",
    "IT",
    "Компьютерные игры",
    "Технологии",
    "Еда",
    "Настольные игры",
    "Наука",
    "Музыка",
    "Саморазвитие",
    "ЗОЖ",
    "Образование",
    "Кино",
    "Шопинг",
    "Ресторан",
  ];

  const handleCloseProfile = () => {
    navigate(-1);
  };

  const handleExit = () => {
    localStorage.removeItem("isAuth");
    localStorage.removeItem("onboarded");
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

  const handleAddInterests = () => {
    setInterests((prev) => {
      const next = [...prev, ...selectedNewInterests.filter((i) => !prev.includes(i))];
      setStoredInterests(sessionStore.user.id, next);
      return next;
    });
    setActiveModal(null);
    setSelectedNewInterests([]);
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
            <Avatar size={96} src={sessionStore.user.avatar} />
            <UserName>{sessionStore.user.name}</UserName>
            {(city || sessionStore.city) && (
              <LocationWrapper>
                <Icon20PlaceOutline width={16} height={16} />
                {city || sessionStore.city}
              </LocationWrapper>
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
                    background: "#2688eb",
                  }}
                >
                  Добавить ({selectedNewInterests.length})
                </Chip> */}
                <Chip
                  onClick={handleAddInterests}
                  style={{
                    width: "calc(100% - 32px)",
                    margin: "16px",
                    background: "#2688eb",
                    display: "flex",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <span
                    style={{ flexGrow: 1, textAlign: "center", paddingLeft: "24px", color: "#fff" }}
                  >
                    Добавить ({selectedNewInterests.length})
                  </span>
                </Chip>
              </div>
            </ModalPage>
          </ModalRoot>

          <InterestsHeading>Друзья ({friends.length})</InterestsHeading>
          <ChipsContainer style={{ gap: 16 }}>
            {friends.map((f) => (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  width: 72,
                }}
              >
                <Avatar size={56} src={f.avatar} initials={f.name?.[0]} />
                <span
                  style={{
                    fontSize: 12,
                    textAlign: "center",
                    color: "var(--vkui--color_text_primary)",
                  }}
                >
                  {f.name}
                </span>
              </div>
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
          </BrightSwitchScope>
        </Group>
      </ContentWrapper>

      <LogoutButton onClick={handleExit}>Выйти</LogoutButton>
    </PageRoot>
  );
};

export default observer(UserProfile);
