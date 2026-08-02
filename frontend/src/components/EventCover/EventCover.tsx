import { useEffect, useState } from "react";
import styled from "@emotion/styled";

/**
 * Обложка события с понятным поведением при отсутствующем или битом изображении (FE-010).
 *
 * Раньше карточка либо схлопывалась (изображения нет), либо показывала «сломанную»
 * иконку браузера (ссылка недоступна). Теперь место всегда занято плейсхолдером,
 * а размер задан через `aspect-ratio`, поэтому верстка не прыгает при загрузке.
 */

const Frame = styled.div<{ $ratio: string; $rounded: string }>`
  position: relative;
  width: 100%;
  aspect-ratio: ${({ $ratio }) => $ratio};
  border-radius: ${({ $rounded }) => $rounded};
  overflow: hidden;
  background: linear-gradient(135deg, var(--povod-primary) 0%, var(--povod-primary) 100%);
  display: grid;
  place-items: center;
`;

const Image = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const Placeholder = styled.span`
  padding: 8px 12px;
  color: var(--povod-on-primary);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  overflow-wrap: anywhere;
  opacity: 0.9;
`;

export interface EventCoverProps {
  src?: string | null;
  /** Название события — идёт в `alt` изображения. */
  title: string;
  /** Соотношение сторон, по умолчанию 16/9. */
  ratio?: string;
  /** Скругление углов. */
  rounded?: string;
  className?: string;
}

export function EventCover({
  src,
  title,
  ratio = "16 / 9",
  rounded = "var(--povod-radius-md)",
  className,
}: EventCoverProps) {
  const [failed, setFailed] = useState(false);

  // Смена события в той же карточке должна сбрасывать признак ошибки.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <Frame $ratio={ratio} $rounded={rounded} className={className}>
      {showImage ? (
        <Image
          src={src as string}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        // Нейтральная подпись, а не название: заголовок уже показан в карточке рядом,
        // дублировать его в обложке избыточно.
        <Placeholder aria-hidden="true">Без фото</Placeholder>
      )}
    </Frame>
  );
}
