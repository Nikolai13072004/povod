import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "@vkontakte/vkui";
import { sessionStore } from "../stores/sessionStore";

export const RequireAuth = observer(() => {
  const location = useLocation();

  useEffect(() => {
    sessionStore.init();
  }, []);

  if (!sessionStore.initialized) {
    return (
      <div style={{ minHeight: "50vh", display: "grid", placeItems: "center" }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (!sessionStore.authenticated) {
    // Запоминаем адрес целиком, вместе с query. В нём живёт вся суть ссылки на
    // подборку (`?category=...&startsFrom=...`): без search человек после входа
    // попадал в ленту без фильтров, и пересланная ссылка теряла смысл.
    return <Navigate to="/" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return <Outlet />;
});
