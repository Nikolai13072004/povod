import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "../App";
import { NotFound } from "../pages/Errors/NotFound";
import { FirstPage } from "../pages/page-1/page-1";
import { MyLoginForm } from "../pages/Login/FormPage";
import { SelectInterestPage } from "../pages/SelectInterestPage";
import UserProfile from "../pages/Profile/ProfilePage";
import { EventPage } from "../pages/Events/EventPage";
import SignUpEventsPage from "../pages/page-3/page-3";
import ChatPage from "../pages/chat/ChatPage";
import CreateEventForm from "../pages/CreateEvent/CreateEventForm";
import { NotificationsPage } from "../components/Notification/NotificationsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <MyLoginForm /> },
      { path: "page-1", element: <FirstPage /> },
      { path: "page-1/:id", element: <EventPage /> },
      { path: "home", element: <Navigate to="/page-1" replace /> },
      { path: "add", element: <CreateEventForm /> },
      { path: "events", element: <SignUpEventsPage /> },
      { path: "SelectInterestPage", element: <SelectInterestPage /> },
      { path: "Profile", element: <UserProfile /> },
      { path: "chats", element: <ChatPage /> },
      { path: "notifications", element: <NotificationsPage /> },
    ],
  },
]);
