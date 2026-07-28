/**
 * Уменьшение картинки в браузере перед отправкой.
 *
 * Раньше файл уходил на сервер как есть — `FileReader.readAsDataURL` и всё.
 * Отсюда два следствия, оба живые:
 *
 *  1. Снимок с телефона весит 4–8 МБ, в base64 это ещё +33%, а сервер принимает
 *     не больше 5 МБ. То есть прикрепить фото с современного телефона было
 *     попросту нельзя — приходил отказ «Изображение больше 5 MB».
 *  2. Картинка лежит строкой прямо в строке таблицы, а аватарка вдобавок едет в
 *     КАЖДОМ ответе, где встречается её владелец: в списке комментариев, в
 *     списке участников. Двадцать комментариев с аватаркой по мегабайту — это
 *     двадцать мегабайт на одно открытие события.
 *
 * Уменьшение на клиенте — не времянка до объектного хранилища: аватарки
 * ужимают перед отправкой всегда, где бы они потом ни лежали.
 */

export interface ResizeOptions {
  /** Наибольшая сторона результата в пикселях. */
  maxSize: number;
  /** Качество JPEG, 0–1. */
  quality: number;
  /**
   * Обрезать до квадрата по центру. Для аватарки это правильно: она всюду
   * показывается кругом, и несжатый прямоугольник обрезал бы браузер как попало.
   */
  square?: boolean;
}

/** Аватарка: круг диаметром до 96px на экране, 256 хватает и для плотных экранов. */
export const AVATAR_RESIZE: ResizeOptions = { maxSize: 256, quality: 0.85, square: true };

/** Обложка события: показывается на всю ширину карточки. */
export const COVER_RESIZE: ResizeOptions = { maxSize: 1280, quality: 0.82 };

/** Что вообще считаем изображением. Совпадает со списком на сервере, без SVG. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      // Ссылку освобождаем сразу: иначе объект живёт до перезагрузки вкладки.
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    image.src = url;
  });
}

/** Размеры и область исходника, которые попадут в результат. */
function targetGeometry(image: HTMLImageElement, options: ResizeOptions) {
  if (options.square) {
    // Центральный квадрат: у портрета отрезаются поля сверху и снизу, у
    // ландшафта — по бокам.
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const size = Math.min(side, options.maxSize);
    return {
      sx: (image.naturalWidth - side) / 2,
      sy: (image.naturalHeight - side) / 2,
      sw: side,
      sh: side,
      dw: size,
      dh: size,
    };
  }

  const scale = Math.min(1, options.maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  return {
    sx: 0,
    sy: 0,
    sw: image.naturalWidth,
    sh: image.naturalHeight,
    // Округляем вверх: нулевая сторона у очень узкой картинки уронила бы canvas.
    dw: Math.max(1, Math.round(image.naturalWidth * scale)),
    dh: Math.max(1, Math.round(image.naturalHeight * scale)),
  };
}

/**
 * Уменьшает файл и отдаёт data URL в JPEG.
 *
 * JPEG, а не исходный формат: прозрачность аватарке и обложке не нужна, а PNG
 * с фотографии весит в разы больше. Прозрачные места заливаются белым — иначе
 * они станут чёрными, потому что canvas по умолчанию пустой и прозрачный.
 */
export async function resizeImageToDataUrl(file: File, options: ResizeOptions): Promise<string> {
  const image = await loadImage(file);
  const { sx, sy, sw, sh, dw, dh } = targetGeometry(image, options);

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не поддерживает обработку изображений");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, dw, dh);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);

  return canvas.toDataURL("image/jpeg", options.quality);
}

/** Понятная человеку проверка до чтения файла. */
export function describeUnsupportedImage(file: File): string | undefined {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Подойдёт JPEG, PNG, WebP или GIF";
  }
  // Гигантский файл читать незачем: до уменьшения он целиком попадёт в память.
  if (file.size > 25 * 1024 * 1024) {
    return "Файл слишком большой — до 25 МБ";
  }
  return undefined;
}
