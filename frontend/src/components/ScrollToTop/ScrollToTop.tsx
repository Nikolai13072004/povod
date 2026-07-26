import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Сбрасывает прокрутку окна наверх при переходе на новый маршрут.
 * React Router не восстанавливает скролл сам, из-за чего новая страница
 * открывалась на позиции предыдущей. Ключом служит только `pathname`,
 * поэтому изменение query/hash (например, поиск в ленте) скролл не трогает.
 */
export function ScrollToTop(): null {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
