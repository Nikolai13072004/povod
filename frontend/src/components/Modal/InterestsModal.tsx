import styled from "@emotion/styled";
import { ModalPage, ModalPageHeader, PanelHeaderButton, Button } from "@vkontakte/vkui";
import { Icon24Dismiss } from "@vkontakte/icons";

const InterestsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px;
`;

const InterestTag = styled.button<{ $active?: boolean }>`
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--vkui--color_separator_primary_alpha);
  background: ${(props) =>
    props.$active
      ? "var(--vkui--color_background_accent_themed)"
      : "var(--vkui--color_background_content)"};
  color: ${(props) => (props.$active ? "#fff" : "var(--vkui--color_text_secondary)")};
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.95);
  }
`;

interface InterestsModalProps {
  id: string;
  onClose: () => void;
}

const INTERESTS_OPTIONS = [
  "Спорт",
  "Искусство",
  "Путешествия",
  "IT",
  "Компьютерные игры",
  "Технологии",
  "Еда",
  "Настольные игры",
  "Наука",
  "Музыка",
  "Саморазвитие",
  "Образование",
  "Кино",
  "Шопинг",
  "Ресторан",
  "Музей",
  "Отдых",
];

export function InterestsModal({ id, onClose }: InterestsModalProps) {
  return (
    <ModalPage
      id={id}
      onClose={onClose}
      header={
        <ModalPageHeader
          after={
            <PanelHeaderButton onClick={onClose}>
              <Icon24Dismiss />
            </PanelHeaderButton>
          }
        >
          Выберите свои интересы
        </ModalPageHeader>
      }
    >
      <InterestsGrid>
        {INTERESTS_OPTIONS.map((interest) => (
          <InterestTag key={interest}>{interest}</InterestTag>
        ))}
      </InterestsGrid>

      <div style={{ padding: "0 16px 20px" }}>
        <Button size="l" stretched onClick={onClose} style={{ borderRadius: 12 }}>
          Применить
        </Button>
      </div>
    </ModalPage>
  );
}
