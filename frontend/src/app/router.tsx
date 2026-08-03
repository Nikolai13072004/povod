import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
import App from "../App";
import { NotFound } from "../pages/Errors/NotFound";
import { RequireAuth } from "./RequireAuth";

// Страницы грузятся лениво (code-splitting), чтобы уменьшить initial bundle.
// Fallback на время загрузки задан через <Suspense> в App.
const FirstPage = lazy(() =>
  import("../pages/page-1/page-1").then((m) => ({ default: m.FirstPage })),
);
const MyLoginForm = lazy(() =>
  import("../pages/Login/FormPage").then((m) => ({ default: m.MyLoginForm })),
);
const SelectInterestPage = lazy(() =>
  import("../pages/SelectInterestPage").then((m) => ({ default: m.SelectInterestPage })),
);
const PasswordResetPage = lazy(() => import("../pages/Login/PasswordResetPage"));
const UserProfile = lazy(() => import("../pages/Profile/ProfilePage"));
const AuthorProfilePage = lazy(() =>
  import("../pages/Profile/AuthorProfilePage").then((m) => ({ default: m.AuthorProfilePage })),
);
const EventPage = lazy(() =>
  import("../pages/Events/EventPage").then((m) => ({ default: m.EventPage })),
);
const SignUpEventsPage = lazy(() => import("../pages/page-3/page-3"));
const ChatPage = lazy(() => import("../pages/chat/ChatPage"));
const ChatThreadPage = lazy(() => import("../pages/chat/ChatThreadPage"));
const EventChatPage = lazy(() => import("../pages/chat/EventChatPage"));
const PeoplePage = lazy(() => import("../pages/People/PeoplePage"));
const CreateEventForm = lazy(() => import("../pages/CreateEvent/CreateEventForm"));
const NotificationsPage = lazy(() =>
  import("../components/Notification/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
  })),
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <MyLoginForm /> },
      // Восстановление пароля доступно без сессии — за ней сюда и приходят (SEC-008).
      { path: "reset-password", element: <PasswordResetPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "page-1", element: <FirstPage /> },
          { path: "page-1/:id", element: <EventPage /> },
          { path: "home", element: <Navigate to="/page-1" replace /> },
          { path: "add", element: <CreateEventForm /> },
          { path: "events", element: <SignUpEventsPage /> },
          { path: "SelectInterestPage", element: <SelectInterestPage /> },
          { path: "Profile", element: <UserProfile /> },
          // Список объявлен до `:id`, иначе «люди» разобрались бы как профиль.
          { path: "users", element: <PeoplePage /> },
          { path: "users/:id", element: <AuthorProfilePage /> },
          { path: "chats", element: <ChatPage /> },
          // Чат события объявлен ДО `chats/:userId`: статический сегмент «event»
          // делает маршрут специфичнее, и переписка его не перехватывает.
          { path: "chats/event/:eventId", element: <EventChatPage /> },
          { path: "chats/:userId", element: <ChatThreadPage /> },
          { path: "notifications", element: <NotificationsPage /> },
        ],
      },
    ],
  },
]);
