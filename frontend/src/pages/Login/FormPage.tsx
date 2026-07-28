import styled from "@emotion/styled";
import { Button } from "@vkontakte/vkui";
import "@vkontakte/vkui/dist/vkui.css";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { sessionStore } from "../../stores/sessionStore";
import { appConfig } from "../../config";

import photoTop from "../../assets/images/2.webp";
import photoBottom from "../../assets/images/1.webp";
import topLogo from "../../assets/images/logo.png";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px 18px 24px;
  min-height: 94dvh;
  background: var(--povod-bg);
  box-sizing: border-box;
  overflow-y: auto;
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
  height: clamp(180px, 38vh, 300px);
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
  font-size: clamp(22px, 6vw, 30px);
  font-weight: 800;
  color: var(--povod-text);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const PageDescription = styled.p`
  font-size: 16px;
  color: var(--povod-text-secondary);
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
  border: 2px solid var(--povod-surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
`;

const UserName = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: var(--povod-text);
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
  color: var(--povod-text-secondary);
  text-align: center;
  opacity: 0.8;
  line-height: 1.4;
  flex-shrink: 0;

  span {
    text-decoration: underline;
  }
`;

const EnterButton = styled(Button)`
  background-color: var(--povod-primary) !important;
  color: var(--povod-on-primary) !important;
  &:active {
    background-color: var(--povod-primary-active) !important;
  }
`;
const AuthForm = styled.form`
  display: grid;
  gap: 10px;
  width: 100%;
`;

const AuthInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--povod-border-strong);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--povod-surface);
  color: var(--povod-text);
  font-size: 15px;
  outline: none;

  &:focus {
    border-color: var(--povod-primary);
    box-shadow: 0 0 0 3px rgba(45, 129, 224, 0.12);
  }
`;

const AuthModeButton = styled.button`
  border: 0;
  background: transparent;
  color: var(--povod-primary);
  cursor: pointer;
  font-size: 14px;
  padding: 10px 8px;
  min-height: 40px;
`;

const AuthError = styled.div`
  color: var(--povod-danger);
  font-size: 13px;
  line-height: 1.35;
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
  const demoAuthEnabled = appConfig.demoAuthEnabled;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(demoAuthEnabled ? "elmira@povod.app" : "");
  const [password, setPassword] = useState(demoAuthEnabled ? "povod-demo" : "");

  /** Куда вести после входа: онбординг проходим только один раз. */
  const afterAuthRoute = (): string =>
    localStorage.getItem("onboarded") === "true" ? "/page-1" : "/SelectInterestPage";

  useEffect(() => {
    if (!sessionStore.initialized || !sessionStore.authenticated) return;
    navigate(afterAuthRoute(), { replace: true });
  }, [navigate, sessionStore.initialized, sessionStore.authenticated]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const success =
      mode === "login"
        ? await sessionStore.login(email, password)
        : await sessionStore.register(name, email, password);
    if (!success) return;
    localStorage.setItem("isAuth", "true");
    // Прошедшего онбординг пользователя ведём сразу в ленту, иначе он на миг
    // попадал на «Выбор интересов» и только оттуда редиректился обратно.
    navigate(afterAuthRoute(), { replace: true });
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
          {isVK && sessionStore.authenticated ? (
            <EnterButton size="l" stretched onClick={() => navigate("/SelectInterestPage")}>
              Продолжить как {firstName}
            </EnterButton>
          ) : (
            <AuthForm onSubmit={handleSubmit}>
              {mode === "register" && (
                <AuthInput
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ваше имя"
                  autoComplete="name"
                  required
                />
              )}
              <AuthInput
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                autoComplete="email"
                required
              />
              <AuthInput
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Пароль"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8}
                required
              />
              {sessionStore.error && <AuthError>{sessionStore.error}</AuthError>}
              <EnterButton
                size="l"
                stretched
                type="submit"
                loading={sessionStore.isLoading}
                disabled={sessionStore.isLoading}
              >
                {mode === "login" ? "Войти в POVOD" : "Создать аккаунт"}
              </EnterButton>
              <AuthModeButton
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
              >
                {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
              </AuthModeButton>
              {mode === "login" && (
                <AuthModeButton type="button" onClick={() => navigate("/reset-password")}>
                  Забыли пароль?
                </AuthModeButton>
              )}
            </AuthForm>
          )}
        </ActionButtonWrapper>
      </TextCard>

      <FooterText>
        Создавая аккаунт, вы соглашаетесь с <br />
        <span>Условиями</span> и <span>Политикой</span>
      </FooterText>
    </PageContainer>
  );
});
