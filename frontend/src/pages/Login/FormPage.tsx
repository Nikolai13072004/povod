import styled from "@emotion/styled";
import { Button } from "@vkontakte/vkui";
import "@vkontakte/vkui/dist/vkui.css";
import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { sessionStore } from "../../stores/sessionStore";

import photoTop from "../../assets/images/2.png";
import photoBottom from "../../assets/images/1.png";
import topLogo from "../../assets/images/logo.png";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px 18px 24px;
  height: 94dvh;
  background: #ebf2fa;
  box-sizing: border-box;
  overflow: hidden;
  margin: 0;
`;

const HeroCard = styled.div`
  background: transparent;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
`;

const ImageStack = styled.div`
  position: relative;
  height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const HeroImage = styled.div<{ $zIndex: number; $top?: string; $left?: string; $image?: string }>`
  position: absolute;
  width: 70%;
  height: 180px;
  border-radius: 24px;
  background-image: url(${(props) => props.$image});
  background-size: cover;
  background-position: center;
  z-index: ${(props) => props.$zIndex};
  top: ${(props) => props.$top || "0"};
  left: ${(props) => props.$left || "auto"};
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  border: 4px solid white;
  transform: rotate(${(props) => (props.$zIndex === 1 ? "-5deg" : "3deg")});
`;

const TextCard = styled.div`
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
  margin-top: 10px;
  flex-grow: 1;
`;

const PageTitle = styled.h1`
  font-size: 28px;
  font-weight: 800;
  color: #000000;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const PageDescription = styled.p`
  font-size: 16px;
  color: #818c99;
  margin: 0 0 10px 0;
`;

const UserRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 4px;
`;

const UserAvatar = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
`;

const UserName = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: #2c3e50;
`;

const ActionButtonWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin-top: 3%;
`;

const FooterText = styled.div`
  padding-top: 20px;
  font-size: 12px;
  color: #818c99;
  text-align: center;
  opacity: 0.8;
  line-height: 1.4;
  flex-shrink: 0;

  span {
    text-decoration: underline;
  }
`;

const EnterButton = styled(Button)`
  background-color: #2d81e0 !important;
  color: #ffffff !important;
  &:active {
    background-color: #0062d4 !important;
  }
`;
const TopIcon = styled.img`
  width: 148px;
  height: 44px;
  align-self: center;
  margin-bottom: 16px;
  object-fit: contain;
`;

export const MyLoginForm = observer(() => {
  const navigate = useNavigate();

  useEffect(() => {
    // Уже прошёл онбординг — сразу в ленту, минуя вход и выбор интересов
    if (localStorage.getItem("onboarded") === "true") {
      navigate("/page-1", { replace: true });
    } else if (localStorage.getItem("isAuth") === "true") {
      navigate("/SelectInterestPage", { replace: true });
    }
  }, [navigate]);

  const handleLogin = () => {
    localStorage.setItem("isAuth", "true");
    navigate("/SelectInterestPage", { replace: true });
  };

  // Внутри ВК показываем реального пользователя и приветственную кнопку
  const isVK = sessionStore.isVK;
  const firstName = sessionStore.user.name.split(" ")[0];

  return (
    <PageContainer>
      <TopIcon src={topLogo} alt="Logo" />
      <HeroCard>
        <ImageStack>
          <HeroImage $zIndex={1} $top="10px" $left="10%" $image={photoTop} />
          <HeroImage $zIndex={2} $top="90px" $left="20%" $image={photoBottom} />
        </ImageStack>
      </HeroCard>

      <TextCard>
        <PageTitle>Создать повод</PageTitle>
        <PageDescription>Без долгих переписок. Пригласи одним кликом</PageDescription>

        {isVK && (
          <UserRow>
            {sessionStore.user.avatar && <UserAvatar src={sessionStore.user.avatar} alt="" />}
            <UserName>{sessionStore.user.name}</UserName>
          </UserRow>
        )}

        <ActionButtonWrapper>
          <EnterButton size="l" stretched onClick={handleLogin}>
            {isVK ? `Продолжить как ${firstName}` : "Войти через VK ID"}
          </EnterButton>
        </ActionButtonWrapper>
      </TextCard>

      <FooterText>
        Создавая аккаунт, вы соглашаетесь с <br />
        <span>Условиями</span> и <span>Политикой</span>
      </FooterText>
    </PageContainer>
  );
});
