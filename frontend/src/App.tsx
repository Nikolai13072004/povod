import styled from "@emotion/styled";
import { Outlet, useLocation } from "react-router-dom";
import NavMenu from "./components/NavMenu";
import { THeader } from "./components/Header/Header";
import { observer } from "mobx-react-lite";
import { rootStore } from "./stores/rootStore";
import { sessionStore } from "./stores/sessionStore";
import { useEffect } from "react";
import {
  ConfigProvider,
  AdaptivityProvider,
  AppRoot,
  SplitLayout,
  SplitCol,
} from "@vkontakte/vkui";
import "@vkontakte/vkui/dist/vkui.css";

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
  display: flex;
  flex: 1;
  gap: 20px;
  padding: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 16px;
    padding: 18px 16px 20px;
  }
`;

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
          <AppContainer isWhiteBg={isChatPage}>
            {showAppChrome && <THeader />}

            {rootStore.error && (
              <div style={{ color: "red", padding: "0 24px" }}>{rootStore.error}</div>
            )}

            <MainContent>
              <SplitLayout style={{ justifyContent: "center" }}>
                <SplitCol maxWidth="100%">
                  <main style={{ flex: 1 }}>
                    <Outlet />
                  </main>
                </SplitCol>
              </SplitLayout>
              {showAppChrome && <NavMenu />}
            </MainContent>
          </AppContainer>
        </AppRoot>
      </AdaptivityProvider>
    </ConfigProvider>
  );
});

export default App;
