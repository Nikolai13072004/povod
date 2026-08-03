import { useRef, useState } from "react";
import styled from "@emotion/styled";
import { Switch } from "@vkontakte/vkui";
import Button from "../../components/Button/Button";
import {
  Icon28CameraOutline,
  Icon28PictureOutline,
  Icon28PlaceOutline,
  Icon28UsersOutline,
} from "@vkontakte/icons";
import { useNavigate } from "react-router-dom";
import { eventStore } from "../../stores/EventStore";
import { browserTimezone, localDateTimeToIso } from "../../utils/eventDate";
import { useToast } from "../../components/Toast/ToastProvider";
import { INTERESTS } from "../../data/interests";
import {
  ACCEPTED_IMAGE_TYPES,
  COVER_RESIZE,
  describeUnsupportedImage,
  resizeImageToDataUrl,
} from "../../utils/imageResize";

const FormContainer = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  padding: 16px;
  /* Светло-голубой фон как на макете */
  background: var(--povod-bg);
  padding-bottom: 100px;
`;

/** Строка переключателя чата: текст слева, тумблер справа (PROD-013). */
const ChatToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--povod-surface);
  border: 1px solid var(--povod-border-strong);
  border-radius: var(--povod-radius-md);
`;

const ChatToggleTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--povod-text);
`;

const ChatToggleHint = styled.div`
  font-size: 13px;
  color: var(--povod-text-secondary);
  margin-top: 2px;
`;

const Section = styled.section`
  background: var(--povod-surface);
  margin-bottom: 12px;
  padding: 20px;
  border-radius: var(--povod-radius-lg);
  /* Более мягкая тень */
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
`;

const Label = styled.label`
  display: block;
  margin-bottom: 12px;
  font-weight: 500;
  color: var(--povod-text-secondary); /* Серый текст меток */
  font-size: 14px;
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid var(--povod-border-strong); /* Голубая рамка */
  border-radius: var(--povod-radius-sm);
  font-size: 16px;
  background: var(--povod-surface-muted);
  color: var(--povod-text);

  &::placeholder {
    color: var(--povod-text-secondary);
  }

  &:focus {
    outline: none;
    background: var(--povod-surface);
    border-color: var(--povod-primary);
  }
`;

const PhotoSection = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const PhotoButton = styled.button<{ $isActive?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: none;
  border-radius: var(--povod-radius-sm);
  /* Цвета кнопок из макета */
  background: ${(props) => (props.$isActive ? "var(--povod-text-secondary)" : "var(--povod-surface-muted)")};
  color: ${(props) => (props.$isActive ? "var(--povod-on-primary)" : "var(--povod-text-secondary)")};
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;

  svg {
    color: ${(props) => (props.$isActive ? "var(--povod-on-primary)" : "var(--povod-text-secondary)")};
  }
`;

const CategoryGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const CategoryChip = styled.button<{ $active: boolean }>`
  padding: 10px 16px;
  border: 1px solid
    ${(props) => (props.$active ? "var(--povod-primary)" : "var(--povod-border-strong)")};
  border-radius: var(--povod-radius-sm);
  background: var(--povod-surface);
  color: ${(props) => (props.$active ? "var(--povod-primary)" : "var(--povod-text-secondary)")};
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--povod-surface-muted);
  }
`;

const TimeRow = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 8px;

  /* На узком экране поля идут столбиком, дальше — в строку. */
  @media (min-width: 480px) {
    grid-template-columns: 1.4fr 1fr 1fr;
  }
`;

const FieldHint = styled.p`
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--povod-text-secondary);
`;

// const FormContainer = styled.div`
//   min-height: 100vh;
//   padding: 24px 18px 32px;
//   background: var(--vkui--color_background_primary);
//   margin-bottom: 30px;
// `;

// const Section = styled.section`
//   background: var(--vkui--color_background_secondary);
//   margin-bottom: 16px;
//   padding: 24px 20px;
//   border-radius: 24px;
//   box-shadow: 0 12px 32px rgba(33, 79, 175, 0.08);
// `;

// const Label = styled.label`
//   display: block;
//   margin-bottom: 10px;
//   font-weight: 600;
//   color: var(--vkui--color_text_primary);
//   font-size: 15px;
// `;

// const Input = styled.input`
//   width: 100%;
//   box-sizing: border-box; /* Добавь эту строку */
//   padding: 14px 16px;
//   border: 1px solid var(--vkui--color_separator_primary_alpha);
//   border-radius: 16px;
//   font-size: 15px;
//   background: var(--vkui--color_background_canvas);
//   color: var(--vkui--color_text_primary);

//   &:focus {
//     outline: none;
//     border-color: var(--vkui--color_background_accent);
//   }
// `;

const TextArea = styled.textarea`
  width: 100%;
  box-sizing: border-box; /* И здесь тоже */
  min-height: 124px;
  padding: 14px 16px;
  border: 1px solid var(--vkui--color_separator_primary_alpha);
  border-radius: var(--povod-radius-sm);
  background: var(--vkui--color_background_canvas);
  color: var(--vkui--color_text_primary);
  resize: vertical;

  &:focus {
    outline: none;
    border-color: var(--vkui--color_background_accent);
  }
`;
// const PhotoSection = styled.div`
//   display: grid;
//   grid-template-columns: repeat(2, minmax(0, 1fr));
//   gap: 12px;
//   margin-top: 8px;
// `;

// const PhotoButton = styled.button<{ $isActive?: boolean }>`
//   display: flex;
//   align-items: center;
//   justify-content: center;
//   gap: 10px;
//   padding: 14px;
//   border: 1px solid var(--vkui--color_separator_primary_alpha);
//   border-radius: 16px;
//   background: ${(props) =>
//     props.$isActive
//       ? "var(--vkui--color_background_accent)"
//       : "var(--vkui--color_background_canvas)"};
//   color: ${(props) => (props.$isActive ? "var(--povod-on-primary)" : "var(--vkui--color_text_primary)")};
//   font-size: 15px;
//   cursor: pointer;
//   transition:
//     background 0.2s ease,
//     color 0.2s ease,
//     transform 0.2s ease;

//   &:hover {
//     transform: translateY(-1px);
//   }

//   svg {
//     color: ${(props) => (props.$isActive ? "var(--povod-on-primary)" : "var(--vkui--color_icon_secondary)")};
//   }
// `;

// const CategoryGrid = styled.div`
//   display: grid;
//   grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
//   gap: 10px;
//   margin-top: 8px;
// `;

// const CategoryChip = styled.button<{ $active: boolean }>`
//   width: 100%;
//   padding: 12px 14px;
//   border: 1px solid var(--vkui--color_separator_primary_alpha);
//   border-radius: 30px;
//   background: ${(props) =>
//     props.$active
//       ? "var(--vkui--color_background_accent)"
//       : "var(--vkui--color_background_canvas)"};
//   color: ${(props) => (props.$active ? "var(--povod-on-primary)" : "var(--vkui--color_text_primary)")};
//   font-size: 14px;
//   font-weight: 600;
//   cursor: pointer;
//   transition:
//     background 0.2s ease,
//     color 0.2s ease,
//     transform 0.2s ease;

//   &:hover {
//     transform: translateY(-1px);
//   }
// `;

// const TimeRow = styled.div`
//   display: flex;
//   gap: 12px;
//   flex-wrap: wrap;
//   margin-top: 12px;
// `;

const LocationField = styled.div`
  position: relative;
  margin-top: 8px;
  display: flex;
  align-items: center;
`;

const StyledLocationIcon = styled(Icon28PlaceOutline)`
  position: absolute;
  left: 12px;
  color: var(--vkui--color_icon_secondary);
`;

const LocationInput = styled(Input)`
  padding-left: 48px;
`;

const FormatRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const SubmitSection = styled.div`
  margin-top: 8px;
`;

const RequiredHint = styled.p`
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--povod-text-secondary);
`;

const RequiredMark = styled.span`
  color: var(--povod-danger);
  font-weight: 600;
`;

const SubmitError = styled.div`
  margin-bottom: 12px;
  color: var(--vkui--color_text_negative, var(--povod-danger));
  font-size: 14px;
  line-height: 1.4;
  text-align: center;
`;

const categories = INTERESTS;

interface FormData {
  title: string;
  description: string;
  categories: string[];
  photoSource: "gallery" | "camera" | null;
  date: string;
  timeFrom: string;
  /** Время окончания. Пустое — автор его не указывает (BE-006). */
  timeTo: string;
  /** Ограничение мест строкой: поле может быть пустым, а `number` пустым не бывает. */
  participantLimit: string;
  photoData: string | null;
  location: string;
  format: "public" | "private";
  /** Чат участников события (PROD-013). По умолчанию выключен. */
  chatEnabled: boolean;
}

export default function CreateEventForm() {
  const navigate = useNavigate();
  const showToast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    categories: [],
    photoSource: null,
    photoData: null,
    date: "",
    timeFrom: "",
    timeTo: "",
    participantLimit: "",
    location: "",
    format: "public",
    chatEnabled: false,
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Сбрасываем сразу: иначе повторный выбор того же файла не даст события.
    event.target.value = "";
    if (file) {
      const unsupported = describeUnsupportedImage(file);
      if (unsupported) {
        showToast(unsupported, { type: "error" });
        return;
      }

      /*
       * Уменьшаем перед отправкой. Снимок с телефона весит 4–8 МБ, в base64 это
       * ещё +33%, а сервер принимает не больше 5 МБ — то есть фото с
       * современного телефона прикрепить было попросту нельзя. После сжатия до
       * 1280px по большей стороне это ~200 КБ.
       */
      try {
        const dataUrl = await resizeImageToDataUrl(file, COVER_RESIZE);
        setFormData((prev) => ({ ...prev, photoData: dataUrl, photoSource: "gallery" }));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Не удалось обработать изображение", {
          type: "error",
        });
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };
  const toggleCategory = (category: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((item) => item !== category)
        : [...prev.categories, category],
    }));
  };

  const setPhotoSource = (source: FormData["photoSource"]) => {
    setFormData((prev) => ({ ...prev, photoSource: source }));
  };

  const setFormat = (format: FormData["format"]) => {
    setFormData((prev) => ({ ...prev, format }));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitError(null);
    if (!formData.title || !formData.date || !formData.location) {
      setSubmitError("Заполните название, дату и место события.");
      return;
    }
    setSubmitting(true);

    const timezone = browserTimezone();
    let startsAt: string;
    let endsAt: string | undefined;
    try {
      startsAt = localDateTimeToIso(formData.date, formData.timeFrom, timezone);
      // Окончание — та же дата: событие, переходящее за полночь, задаётся
      // редактированием после создания, чтобы не усложнять форму на входе.
      endsAt = formData.timeTo
        ? localDateTimeToIso(formData.date, formData.timeTo, timezone)
        : undefined;
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Некорректные дата и время");
      setSubmitting(false);
      return;
    }

    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      setSubmitError("Событие не может закончиться раньше, чем началось.");
      setSubmitting(false);
      return;
    }

    const limit = formData.participantLimit.trim();
    const participantLimit = limit ? Number(limit) : undefined;
    if (
      participantLimit !== undefined &&
      (!Number.isInteger(participantLimit) || participantLimit < 1)
    ) {
      setSubmitError("Ограничение мест — целое число от 1.");
      setSubmitting(false);
      return;
    }

    const created = await eventStore.createEvent({
      title: formData.title,
      description: formData.description,
      startsAt,
      endsAt,
      participantLimit,
      timezone,
      location: formData.location,
      category: formData.categories[0] || "Общее",
      // Секция «Категории» — мультивыбор, но в событии поле `category` одно.
      // Остальные выбранные уезжали в никуда: автор отмечал «IT, Наука,
      // Образование», сохранялось «IT», и по «Науке» событие уже не находилось.
      // Лента фильтрует и по тегам, поэтому остаток кладётся туда.
      tags: formData.categories.slice(1),
      image:
        formData.photoData ||
        "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80",
      format: formData.format,
      chatEnabled: formData.chatEnabled,
    });

    setSubmitting(false);
    if (created) {
      navigate("/events");
    } else {
      setSubmitError(eventStore.actionError ?? "Не удалось создать событие");
    }
  };

  return (
    <FormContainer>
      {/* Обычный заголовок, а не залитый баннер: залитая плашка выглядела
          кнопкой, хотя ею не была, — а настоящая кнопка «Создать повод» внизу
          формы. Два одинаковых «псевдонажимаемых» элемента путали. */}
      <h1
        style={{
          margin: "4px 0 12px",
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--povod-text)",
        }}
      >
        Создать повод
      </h1>

      {/* Звёздочку в подписях надо расшифровать: сама по себе она ничего не
          сообщает тому, кто видит форму впервые. */}
      <RequiredHint>
        Поля со звёздочкой <RequiredMark>*</RequiredMark> обязательны
      </RequiredHint>

      <Section>
        <Label>Название события *</Label>
        <Input
          type="text"
          placeholder="Поход в кино"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </Section>

      <Section>
        <Label>Описание</Label>
        <TextArea
          placeholder="Расскажи, чего ожидать..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </Section>

      <Section>
        <Label>Добавить фото</Label>
        {/* Скрытый инпут */}
        <input
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={(event) => void handleFileChange(event)}
        />

        <PhotoSection>
          <PhotoButton
            type="button"
            $isActive={formData.photoSource === "gallery"}
            onClick={triggerFileSelect} // Теперь вызывает выбор файла
          >
            <Icon28PictureOutline width={24} height={24} />
            {formData.photoData ? "Изменено" : "Из галереи"}
          </PhotoButton>

          <PhotoButton
            type="button"
            $isActive={formData.photoSource === "camera"}
            onClick={() => setPhotoSource("camera")}
          >
            <Icon28CameraOutline width={24} height={24} />
            Сделать фото
          </PhotoButton>
        </PhotoSection>

        {formData.photoData && (
          <div
            style={{
              marginTop: 12,
              borderRadius: "var(--povod-radius-sm)",
              overflow: "hidden",
              width: "100%",
              aspectRatio: "16 / 9",
            }}
          >
            <img
              src={formData.photoData}
              alt="Preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}
      </Section>
      <Section>
        <Label>Категории</Label>
        <CategoryGrid>
          {categories.map((category) => (
            <CategoryChip
              key={category}
              type="button"
              $active={formData.categories.includes(category)}
              onClick={() => toggleCategory(category)}
            >
              {category}
            </CategoryChip>
          ))}
        </CategoryGrid>
      </Section>

      <Section>
        <Label>Дата и время *</Label>
        <TimeRow>
          <Input
            type="date"
            aria-label="Дата события"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
          <Input
            type="time"
            aria-label="Время начала"
            value={formData.timeFrom}
            onChange={(e) => setFormData({ ...formData, timeFrom: e.target.value })}
          />
          <Input
            type="time"
            aria-label="Время окончания"
            value={formData.timeTo}
            onChange={(e) => setFormData({ ...formData, timeTo: e.target.value })}
          />
        </TimeRow>
        <FieldHint>Окончание можно не указывать — тогда время конца не показывается.</FieldHint>
      </Section>

      <Section>
        <Label>Сколько человек можно записать</Label>
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          placeholder="Без ограничения"
          aria-label="Ограничение числа участников"
          value={formData.participantLimit}
          onChange={(e) => setFormData({ ...formData, participantLimit: e.target.value })}
        />
        <FieldHint>
          Считая вас: с ограничением 5 к вам смогут присоединиться ещё четверо. Оставьте пустым,
          если предела нет.
        </FieldHint>
      </Section>

      <Section>
        <Label>Место *</Label>
        <LocationField>
          <StyledLocationIcon width={24} height={24} />
          <LocationInput
            type="text"
            placeholder="Полный адрес или ссылка"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />
        </LocationField>
      </Section>

      <Section>
        <Label>Формат события</Label>
        <FormatRow>
          <PhotoButton
            type="button"
            $isActive={formData.format === "private"}
            onClick={() => setFormat("private")}
          >
            Закрытое
          </PhotoButton>
          <PhotoButton
            type="button"
            $isActive={formData.format === "public"}
            onClick={() => setFormat("public")}
          >
            Публичное
          </PhotoButton>
        </FormatRow>
      </Section>

      <Section>
        <Label>Чат участников</Label>
        <ChatToggleRow>
          <div>
            <ChatToggleTitle>Общий чат события</ChatToggleTitle>
            <ChatToggleHint>
              Участники смогут договориться перед встречей. Записавшихся позовём в чат.
            </ChatToggleHint>
          </div>
          <Switch
            checked={formData.chatEnabled}
            onChange={(e) => setFormData({ ...formData, chatEnabled: e.target.checked })}
            aria-label="Включить чат участников"
          />
        </ChatToggleRow>
      </Section>

      <SubmitSection>
        {submitError && <SubmitError role="alert">{submitError}</SubmitError>}
        <Button
          fullWidth
          size="lg"
          variant="primary"
          type="button"
          onClick={handleSubmit}
          loading={submitting}
          disabled={submitting}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <Icon28UsersOutline width={24} height={24} />
            Создать повод
          </span>
        </Button>
      </SubmitSection>
    </FormContainer>
  );
}
