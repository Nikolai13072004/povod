import styled from "@emotion/styled";
import { ModalPage, ModalPageHeader, PanelHeaderButton, Button } from "@vkontakte/vkui";
import { Icon24Dismiss } from "@vkontakte/icons";

const ContentGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px;
`;

const OptionTag = styled.button<{ $active?: boolean }>`
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--vkui--color_separator_primary_alpha);
  background: ${(props) =>
    props.$active
      ? "var(--vkui--color_background_accent)"
      : "var(--vkui--color_background_content)"};
  color: ${(props) => (props.$active ? "#fff" : "var(--vkui--color_text_primary)")};
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.95);
  }
`;

interface FilterModalProps {
  id: string;
  title: string;
  options: string[];
  selectedOptions: string[];
  onToggle: (option: string) => void;
  onClose: () => void;
}

export function FilterModal({
  id,
  title,
  options,
  selectedOptions,
  onToggle,
  onClose,
}: FilterModalProps) {
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
          {title}
        </ModalPageHeader>
      }
    >
      <ContentGrid>
        {options.map((option) => (
          <OptionTag
            key={option}
            $active={selectedOptions.includes(option)}
            onClick={() => onToggle(option)}
          >
            {option}
          </OptionTag>
        ))}
      </ContentGrid>

      <div style={{ padding: "0 16px 20px" }}>
        <Button size="l" stretched onClick={onClose} style={{ borderRadius: 12 }}>
          Применить
        </Button>
      </div>
    </ModalPage>
  );
}
