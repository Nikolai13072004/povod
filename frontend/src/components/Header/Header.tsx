import styled from "@emotion/styled";
import { observer } from "mobx-react-lite";
import { useTheme } from "../../context/ThemeContext";
import { BellIcon } from "../../icons/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { sessionStore } from "../../stores/sessionStore";

const Header = styled.header<{ $mode: "light" | "dark" }>`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--vkui--color_background_primary);
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-grow: 1;
  margin-left: 14px;
`;

const Avatar = styled.div<{ $avatar?: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: #ceddf7;
  background-image: url(${(props) => props.$avatar || ""});
  background-size: cover;
  background-position: center;
  cursor: pointer;
`;

const PageTitle = styled.h1`
  font-size: 20px;
  font-weight: 700;
  margin: 0;

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
      <PageHeader>
        <LeftSection>
          <Avatar
            $avatar={sessionStore.user.avatar}
            onClick={handleAvatarClick}
            title={sessionStore.user.name}
          />
          <PageTitle>{displayTitle}</PageTitle>
        </LeftSection>

        <IconButton $mode={theme} type="button" aria-label="Уведомления" onClick={handleBellClick}>
          <BellIcon />
        </IconButton>
      </PageHeader>
    </Header>
  );
});
