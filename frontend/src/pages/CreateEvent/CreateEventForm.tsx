import { useRef, useState } from "react";
import styled from "@emotion/styled";
import Button from "../../components/Button/Button";
import {
  Icon28CameraOutline,
  Icon28PictureOutline,
  Icon28PlaceOutline,
  Icon28UsersOutline,
} from "@vkontakte/icons";
import { useNavigate } from "react-router-dom";
import { eventStore } from "../../stores/EventStore";
import { sessionStore } from "../../stores/sessionStore";

const FormContainer = styled.div`
  min-height: 100vh;
  padding: 16px;
  /* Светло-голубой фон как на макете */
  background: #ebf2fa;
  padding-bottom: 100px;
`;

const Section = styled.section`
  background: #ffffff;
  margin-bottom: 12px;
  padding: 20px;
  border-radius: 20px;
  /* Более мягкая тень */
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
`;

const Label = styled.label`
  display: block;
  margin-bottom: 12px;
  font-weight: 500;
  color: #909499; /* Серый текст меток */
  font-size: 14px;
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid #99c2f8; /* Голубая рамка */
  border-radius: 12px;
  font-size: 16px;
  background: #f2f5f9;
  color: #2c3e50;

  &::placeholder {
    color: #909499;
  }

  &:focus {
    outline: none;
    background: #ffffff;
    border-color: #3f8ae0;
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
  border-radius: 12px;
  /* Цвета кнопок из макета */
  background: ${(props) => (props.$isActive ? "#94a3b8" : "#f0f2f5")};
  color: ${(props) => (props.$isActive ? "#ffffff" : "#818c99")};
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;

  svg {
    color: ${(props) => (props.$isActive ? "#ffffff" : "#818c99")};
  }
`;

const CategoryGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const CategoryChip = styled.button<{ $active: boolean }>`
  padding: 10px 16px;
  border: 1px solid ${(props) => (props.$active ? "#3f8ae0" : "#e1e3e6")};
  border-radius: 10px;
  background: #ffffff;
  color: ${(props) => (props.$active ? "#3f8ae0" : "#818c99")};
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #f5f7f8;
  }
`;

const TimeRow = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 8px;
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
  border-radius: 16px;
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
//   color: ${(props) => (props.$isActive ? "#ffffff" : "var(--vkui--color_text_primary)")};
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
//     color: ${(props) => (props.$isActive ? "#ffffff" : "var(--vkui--color_icon_secondary)")};
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
//   color: ${(props) => (props.$active ? "#ffffff" : "var(--vkui--color_text_primary)")};
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

const SegmentedControlWrapper = styled(Section)`
  display: flex;
  padding: 8px;
  gap: 8px;
`;

const SegmentButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  background: ${(props) => (props.$active ? "#2D81E0" : "#EBEDF0")};
  color: ${(props) => (props.$active ? "#FFFFFF" : "#818C99")};

  &:hover {
    opacity: 0.9;
  }
`;

const categories = [
  "Спорт",
  "Искусство",
  "Путешествие",
  "IT",
  "Компьютерные игры",
  "Технологии",
  "Еда",
  "Настольные игры",
  "Наука",
  "Музыка",
  "Саморазвитие",
  "ЗОЖ",
  "Образование",
  "Кино",
  "Шопинг",
  "Ресторан",
];

interface FormData {
  title: string;
  description: string;
  categories: string[];
  photoSource: "gallery" | "camera" | null;
  date: string;
  timeFrom: string;
  timeTo: string;
  photoData: string | null;
  location: string;
  format: "public" | "private";
}

export default function CreateEventForm() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeType, setActiveType] = useState<"exact" | "idea">("idea");
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    categories: [],
    photoSource: null,
    photoData: null,
    date: "",
    timeFrom: "",
    timeTo: "",
    location: "",
    format: "public",
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Пожалуйста, выберите файл изображения");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert("Файл слишком большой. Максимальный размер: 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          setFormData((prev) => ({
            ...prev,
            photoData: result,
            photoSource: "gallery",
          }));
        }
      };
      reader.readAsDataURL(file);
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
    if (!formData.title || !formData.date) return;
    setSubmitting(true);

    // <input type="date"> отдаёт "YYYY-MM-DD" -> приводим к формату приложения "DD/MM/YY"
    const [yyyy, mm, dd] = formData.date.split("-");
    const dateStr = yyyy && mm && dd ? `${dd}/${mm}/${yyyy.slice(2)}` : formData.date;

    const created = await eventStore.createEvent({
      title: formData.title,
      description: formData.description,
      date: dateStr,
      time: formData.timeFrom,
      location: formData.location,
      category: formData.categories[0] || "Общее",
      image:
        formData.photoData ||
        "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80",
      format: formData.format,
      author: sessionStore.user.name,
      authorId: sessionStore.user.id,
    });

    setSubmitting(false);
    if (created) navigate("/events");
  };

  return (
    <FormContainer>
      <div
        style={{
          background: "#2D81E0",
          padding: "20px 16px",
          margin: "-16px -16px 16px -16px",
          textAlign: "center",
          color: "white",
          fontWeight: "bold",
          borderRadius: "20px",
        }}
      >
        Создать повод
      </div>

      <SegmentedControlWrapper>
        <SegmentButton
          type="button"
          $active={activeType === "exact"}
          onClick={() => setActiveType("exact")}
        >
          Точный повод
        </SegmentButton>
        <SegmentButton
          type="button"
          $active={activeType === "idea"}
          onClick={() => setActiveType("idea")}
        >
          Идея
        </SegmentButton>
      </SegmentedControlWrapper>
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
        <Label>Описание *</Label>
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
          accept="image/*"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
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
          <div style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", height: 150 }}>
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
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
          <Input
            type="time"
            value={formData.timeFrom}
            onChange={(e) => setFormData({ ...formData, timeFrom: e.target.value })}
          />
          <Input
            type="time"
            value={formData.timeTo}
            onChange={(e) => setFormData({ ...formData, timeTo: e.target.value })}
          />
        </TimeRow>
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

      <SubmitSection>
        <Button fullWidth size="lg" variant="primary" type="button" onClick={handleSubmit}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <Icon28UsersOutline width={24} height={24} />
            Отправить повод
          </span>
        </Button>
      </SubmitSection>
    </FormContainer>
  );
}
