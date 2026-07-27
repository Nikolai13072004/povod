import styled from "@emotion/styled";
import { observer } from "mobx-react-lite";
import { useTheme } from "../../context/ThemeContext";
import { BellIcon } from "../../icons/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { sessionStore } from "../../stores/sessionStore";
import { ContentWidth } from "../Layout/ContentWidth";

const Header = styled.header<{ $mode: "light" | "dark" }>`
  padding: 12px 0;
  background: var(--vkui--color_background_primary);
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 16px;
  box-sizing: border-box;
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-grow: 1;
  margin-left: 14px;
  min-width: 0;
`;

const Avatar = styled.button<{ $avatar?: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--povod-surface-muted);
  background-image: url(${(props) => props.$avatar || ""});
  background-size: cover;
  background-position: center;
  border: none;
  padding: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--vkui--color_text_accent, var(--povod-primary));
    outline-offset: 2px;
  }
`;

const PageTitle = styled.h1`
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  color: var(--vkui--color_text_primary);
`;

const IconButton = styled.button<{ $mode: "light" | "dark" }>`
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--vkui--color_text_accent);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;

  &:active {
    opacity: 0.7;
  }
`;

export const THeader = observer(function THeader() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleAvatarClick = () => {
    localStorage.setItem("isAuth", "true");
    navigate("/Profile");
  };

  const displayTitle =
    location.pathname.includes("events") || location.pathname.includes("page-3")
      ? "Мои поводы"
      : "Главная";

  const handleBellClick = () => {
    navigate("/notifications");
  };

  return (
    <Header $mode={theme}>
      <ContentWidth>
        <PageHeader>
          <LeftSection>
            <Avatar
              type="button"
              $avatar={sessionStore.user.avatar}
              onClick={handleAvatarClick}
              title={sessionStore.user.name}
              aria-label={`Профиль: ${sessionStore.user.name}`}
            />
            <PageTitle>{displayTitle}</PageTitle>
          </LeftSection>

          <IconButton
            $mode={theme}
            type="button"
            aria-label="Уведомления"
            onClick={handleBellClick}
          >
            <BellIcon />
          </IconButton>
        </PageHeader>
      </ContentWidth>
    </Header>
  );
});
