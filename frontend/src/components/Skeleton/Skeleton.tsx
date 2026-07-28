import styled from "@emotion/styled";

/**
 * Скелетоны загрузки (FE-015).
 *
 * Один спиннер посреди пустого экрана не говорит, что появится: список,
 * карточка или ошибка. Скелетон повторяет геометрию будущего содержимого,
 * поэтому ожидание короче на ощупь, а верстка не прыгает в момент подстановки
 * данных.
 *
 * Из этого следует главное ограничение: скелетон обязан совпадать с реальной
 * разметкой. Расходящийся скелетон вреднее спиннера — он обещает одно, а
 * показывает другое.
 *
 * Скелетоны намеренно скрыты от скринридеров (`aria-hidden`): озвучивать
 * «серый прямоугольник» нечего. Состояние загрузки объявляет `AsyncContent`
 * текстом в `aria-live`.
 */

/** Базовый блок. Мерцание отключается при `prefers-reduced-motion` (UX-012). */
export const Skeleton = styled.div<{ $width?: string; $height?: string; $radius?: string }>`
  width: ${({ $width = "100%" }) => $width};
  height: ${({ $height = "16px" }) => $height};
  border-radius: ${({ $radius = "8px" }) => $radius};
  background: var(--povod-surface-muted);
  position: relative;
  overflow: hidden;

  /*
   * Блик — povod-border-strong, а не полупрозрачный белый: он контрастен к
   * приглушённой поверхности в обеих темах, тогда как белый на тёмной теме
   * пропадает.
   */
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, var(--povod-border-strong), transparent);
    opacity: 0.6;
    animation: povod-skeleton-shimmer 1.4s infinite;
  }

  @keyframes povod-skeleton-shimmer {
    100% {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }
`;

/** Повторяет `EventCard` из ленты: обложка 16/9, заголовок, две строки метаданных, кнопки. */
const CardShell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--vkui--color_background_secondary);
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
`;

const MetaRow = styled.div`
  display: flex;
  gap: 14px;
`;

const ActionsRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

export function EventCardSkeleton() {
  return (
    <CardShell aria-hidden="true" data-testid="event-card-skeleton">
      <Skeleton $height="auto" $radius="16px" style={{ aspectRatio: "16 / 9" }} />
      <Skeleton $height="20px" $width="70%" />
      <MetaRow>
        <Skeleton $height="13px" $width="96px" />
        <Skeleton $height="13px" $width="64px" />
      </MetaRow>
      <MetaRow>
        <Skeleton $height="13px" $width="45%" />
      </MetaRow>
      <ActionsRow>
        <Skeleton $height="36px" $radius="10px" />
        <Skeleton $height="36px" $radius="10px" />
      </ActionsRow>
    </CardShell>
  );
}

const ListShell = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`;

/**
 * Сетка карточек-заглушек.
 *
 * Три штуки: на телефоне это ровно один экран, на широком — один ряд. Больше
 * рисовать нет смысла, ниже сгиба заглушки всё равно никто не увидит.
 */
export function EventListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ListShell aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <EventCardSkeleton key={index} />
      ))}
    </ListShell>
  );
}

/*
 * «Мои события» — своя геометрия: карточка горизонтальная, обложка квадратная и
 * фиксированной ширины слева. Скелетон ленты здесь показал бы не ту разметку,
 * поэтому у раздела отдельный.
 */
const MyEventShell = styled.div`
  background: var(--povod-surface);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
`;

const MyEventCover = styled(Skeleton)`
  width: 100px;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  height: auto;
`;

const MyEventInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MyEventGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
`;

export function MyEventListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <MyEventGrid aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <MyEventShell key={index} data-testid="my-event-skeleton">
          <MyEventCover $radius="12px" />
          <MyEventInfo>
            <Skeleton $height="18px" $width="75%" />
            <Skeleton $height="12px" $width="60%" />
            <Skeleton $height="12px" $width="45%" />
            <Skeleton $height="32px" $radius="10px" />
          </MyEventInfo>
        </MyEventShell>
      ))}
    </MyEventGrid>
  );
}

const DetailsShell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
`;

/** Страница события: обложка, заголовок, три строки описания, блок участников. */
export function EventDetailsSkeleton() {
  return (
    <DetailsShell aria-hidden="true" data-testid="event-details-skeleton">
      <Skeleton $height="auto" $radius="16px" style={{ aspectRatio: "16 / 9" }} />
      <Skeleton $height="28px" $width="65%" />
      <MetaRow>
        <Skeleton $height="14px" $width="120px" />
        <Skeleton $height="14px" $width="88px" />
      </MetaRow>
      <Skeleton $height="14px" />
      <Skeleton $height="14px" />
      <Skeleton $height="14px" $width="80%" />
      <Skeleton $height="44px" $radius="12px" />
    </DetailsShell>
  );
}
