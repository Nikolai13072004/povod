import styled from "@emotion/styled";
import { Outlet, useLocation } from "react-router-dom";
import NavMenu from "./components/NavMenu";
import { THeader } from "./components/Header/Header";
import { observer } from "mobx-react-lite";
import { rootStore } from "./stores/rootStore";
import { sessionStore } from "./stores/sessionStore";
import { useEffect } from "react";
import { ConfigProvider, AdaptivityProvider, AppRoot } from "@vkontakte/vkui";
import "@vkontakte/vkui/dist/vkui.css";
import { ContentWidth } from "./components/Layout/ContentWidth";

const AppContainer = styled.div<{ isWhiteBg?: boolean }>`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  /* Проверка пропса + !important, чтобы перебить index.css */
  background: ${(props) => (props.isWhiteBg ? "#ffffff" : "var(--bg-color)")} !important;
  color: var(--text-color);
  padding-bottom: 20px;
  transition:
    background 0.3s ease,
    color 0.3s ease;
`;

const MainContent = styled.div`
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  padding: 24px 0;

  @media (max-width: 768px) {
    padding: 18px 0 20px;
  }
`;

/** Максимальная ширина колонки контента для текущего маршрута. */
function contentMaxWidth(pathname: string): string {
  if (pathname === "/" || pathname === "/SelectInterestPage") return "480px";
  if (pathname === "/page-1" || pathname === "/events") return "1080px";
  return "760px";
}

const App = observer(() => {
  const location = useLocation();
  const isChatPage = location.pathname === "/chats";
  const isSelectInterestPage = location.pathname === "/SelectInterestPage";
  const isProfilePage = location.pathname === "/Profile";
  const isNotificationsPage = location.pathname === "/notifications";
  const showAppChrome =
    location.pathname !== "/" && !isSelectInterestPage && !isProfilePage && !isNotificationsPage;

  useEffect(() => {
    rootStore.loadBackendStatus();
    sessionStore.init();
  }, []);

  const chatSceneTokens = {
    "--vkui--color_background_primary": "#ffffff",
    "--vkui--color_background_content": "#ffffff",
    "--vkui--color_background_tertiary": "#ffffff",
  } as React.CSSProperties;

  return (
    <ConfigProvider colorScheme="light">
      <AdaptivityProvider>
        <AppRoot style={isChatPage ? chatSceneTokens : {}}>
          <AppContainer
            isWhiteBg={isChatPage}
            style={
              { "--povod-content-max": contentMaxWidth(location.pathname) } as React.CSSProperties
            }
          >
            {showAppChrome && <THeader />}

            <MainContent>
              <ContentWidth as="main">
                <Outlet />
              </ContentWidth>
            </MainContent>
            {showAppChrome && <NavMenu />}
          </AppContainer>
        </AppRoot>
      </AdaptivityProvider>
    </ConfigProvider>
  );
});

export default App;
