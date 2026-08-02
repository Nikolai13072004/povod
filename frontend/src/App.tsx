import styled from "@emotion/styled";
import { Outlet, useLocation } from "react-router-dom";
import NavMenu from "./components/NavMenu";
import { THeader } from "./components/Header/Header";
import { observer } from "mobx-react-lite";
import { rootStore } from "./stores/rootStore";
import { sessionStore } from "./stores/sessionStore";
import { Suspense, useEffect } from "react";
import { ConfigProvider, AdaptivityProvider, AppRoot, Spinner } from "@vkontakte/vkui";
import "@vkontakte/vkui/dist/vkui.css";
import { ContentWidth } from "./components/Layout/ContentWidth";
import { ToastProvider } from "./components/Toast/ToastProvider";
import { ScrollToTop } from "./components/ScrollToTop/ScrollToTop";
import { AppUpdatePrompt } from "./components/AppUpdate/AppUpdatePrompt";
import { useTheme } from "./context/ThemeContext";

const AppContainer = styled.div<{
  isWhiteBg?: boolean;
  $hasNav?: boolean;
  $lockViewport?: boolean;
}>`
  min-height: 100vh;
  min-height: 100dvh;
  /*
   * Экран переписки живёт по своим правилам: он обязан занять ровно высоту окна,
   * а не растягивать страницу. Прокрутку внутри ведёт только лента сообщений,
   * поэтому здесь страница фиксируется по высоте и не скроллится целиком — иначе
   * поле ввода уезжает под шапку, которую высота "весь экран" не вычитала.
   */
  ${(props) =>
    props.$lockViewport ? "height: 100dvh; overflow: hidden; box-sizing: border-box;" : ""}
  display: flex;
  flex-direction: column;
  /* Проверка пропса + !important, чтобы перебить index.css */
  background: ${(props) => (props.isWhiteBg ? "var(--povod-surface)" : "var(--bg-color)")} !important;
  color: var(--text-color);
  /* Когда снизу висит фиксированная навигация, резервируем под неё место —
     иначе конец страницы уезжал под меню и был недоступен. Величина живёт в
     токене: её же читает поле ввода в переписке, и второе число здесь
     разъехалось бы с первым молча. Токен сам обнуляется от 900px. */
  padding-bottom: ${(props) => (props.$hasNav ? "var(--povod-bottom-nav-offset)" : "20px")};
  /* Без transition на background/color: он анимировался при КАЖДОЙ смене маршрута
     (у страниц разный фон), из-за чего фон заметно «мигал» при переходе. */
`;

const MainContent = styled.div<{ $fill?: boolean }>`
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  padding: 24px 0;

  @media (max-width: 768px) {
    padding: 18px 0 20px;
  }

  /**
   * Навигация лежит в разметке после контента — так она оказывается внизу на
   * телефоне. На широком экране контент сдвигается ниже порядком flex, и
   * навигация встаёт под шапкой. Дерево при этом одно: два разных не пришлось
   * бы синхронизировать, но активный раздел терялся бы при смене ширины.
   */
  @media (min-width: 900px) {
    order: 1;
  }

  /*
   * Режим переписки: без вертикальных отступов и как flex-колонка, чтобы
   * дочерний экран мог занять оставшуюся высоту через flex, а не через 100dvh.
   * Двойной амперсанд перебивает медиазапросы выше — иначе их padding вернулся бы.
   */
  ${(props) =>
    props.$fill ? "&& { padding: 0; min-height: 0; display: flex; flex-direction: column; }" : ""}
`;

/** Максимальная ширина колонки контента для текущего маршрута. */
function contentMaxWidth(pathname: string): string {
  if (pathname === "/" || pathname === "/SelectInterestPage") return "480px";
  if (pathname === "/page-1" || pathname === "/events") return "1080px";
  return "760px";
}

const App = observer(() => {
  const location = useLocation();
  // VKUI был жёстко зафиксирован в светлой схеме — теперь следует выбранной теме (UX-001).
  const { theme } = useTheme();
  // startsWith, а не строгое равенство: иначе экран переписки `/chats/:id`
  // молча терял белый фон и токены сцены, настроенные для списка.
  const isChatPage = location.pathname.startsWith("/chats");
  // Именно переписка `/chats/:id`, а не список: только ей нужна раскладка во
  // всю высоту окна с пришпиленным полем ввода.
  const isChatThread = /^\/chats\/[^/]+$/.test(location.pathname);
  const isSelectInterestPage = location.pathname === "/SelectInterestPage";
  const isProfilePage = location.pathname === "/Profile";
  const isNotificationsPage = location.pathname === "/notifications";
  /*
   * Экраны для тех, кто ещё не вошёл: форма входа и восстановление пароля.
   *
   * Навигация приложения на них бессмысленна и вредна: ссылки ведут туда, куда
   * анониму нельзя, и нажатие выбрасывает обратно с «войдите снова». Плюс шапка
   * с навигацией добавляли высоту, из-за которой карточка восстановления
   * уезжала вниз и страница начинала прокручиваться.
   */
  const isPublicRoute = location.pathname === "/" || location.pathname === "/reset-password";
  const showAppChrome =
    !isPublicRoute && !isSelectInterestPage && !isProfilePage && !isNotificationsPage;

  /*
   * Нижнее меню шире, чем верхняя шапка: оно нужно и на профиле, и в
   * уведомлениях, иначе с этих экранов некуда уйти — навигации там не было
   * вовсе, только кнопка «назад» в браузере. Верхнюю шапку эти страницы
   * по-прежнему рисуют свою, поэтому общий заголовок им не добавляем.
   */
  const showNav = !isPublicRoute && !isSelectInterestPage;

  /**
   * Карточка события рисует собственную шапку (VKUI `PanelHeader` с кнопкой «назад»),
   * которая при прокрутке становится фиксированной. Общая шапка приложения на этом
   * маршруте дублировала её и вылезала из-под фиксированной панели. Нижнюю навигацию
   * при этом оставляем.
   */
  const pageHasOwnHeader = /^\/page-1\/[^/]+$/.test(location.pathname);
  const showTopHeader = showAppChrome && !pageHasOwnHeader;

  useEffect(() => {
    rootStore.loadBackendStatus();
    sessionStore.init();
  }, []);

  /*
   * VKUI рисует свои панели по собственной палитре, а не по нашей. В тёмной
   * теме это заметно: страница события лежит на VKUI-фоне, а вокруг —
   * `--povod-bg`, который темнее. Получались чёрные полосы сверху и снизу
   * содержимого, будто событие «висит» на пустоте.
   *
   * Раньше сопоставление делалось только для чата. Теперь оно общее: все
   * поверхности VKUI берут цвета из наших токенов, и обе темы остаются
   * согласованными (UX-011).
   */
  const vkuiSurfaceTokens = {
    "--vkui--color_background": "var(--povod-bg)",
    "--vkui--color_background_primary": "var(--povod-surface)",
    "--vkui--color_background_content": "var(--povod-surface)",
    "--vkui--color_background_secondary": "var(--povod-surface)",
    "--vkui--color_background_tertiary": "var(--povod-bg)",
    "--vkui--color_background_canvas": "var(--povod-surface-muted)",
    "--vkui--color_background_modal": "var(--povod-surface)",
    "--vkui--color_separator_primary": "var(--povod-border)",
    "--vkui--color_text_primary": "var(--povod-text)",
    "--vkui--color_text_secondary": "var(--povod-text-secondary)",
  } as React.CSSProperties;

  // У чата свой светлый фон сцены, поэтому поверхности там равны surface.
  const chatSceneTokens = {
    ...vkuiSurfaceTokens,
    "--vkui--color_background": "var(--povod-surface)",
    "--vkui--color_background_tertiary": "var(--povod-surface)",
  } as React.CSSProperties;

  return (
    <ConfigProvider colorScheme={theme}>
      <AdaptivityProvider>
        <AppRoot style={isChatPage ? chatSceneTokens : vkuiSurfaceTokens}>
          <ScrollToTop />
          <ToastProvider>
            <AppContainer
              isWhiteBg={isChatPage}
              $hasNav={showNav}
              $lockViewport={isChatThread}
              style={
                { "--povod-content-max": contentMaxWidth(location.pathname) } as React.CSSProperties
              }
            >
              {showTopHeader && <THeader />}

              <MainContent $fill={isChatThread}>
                <ContentWidth as="main" $fill={isChatThread}>
                  <Suspense
                    fallback={
                      <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                        <Spinner size="l" />
                      </div>
                    }
                  >
                    <Outlet />
                  </Suspense>
                </ContentWidth>
              </MainContent>
              {showNav && <NavMenu />}
            </AppContainer>
            <AppUpdatePrompt />
          </ToastProvider>
        </AppRoot>
      </AdaptivityProvider>
    </ConfigProvider>
  );
});

export default App;
