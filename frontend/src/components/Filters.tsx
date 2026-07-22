import { useEffect, useState, type ReactNode } from "react";
import styled from "@emotion/styled";
import { CalendarIcon, LocationIcon } from "../icons/icons";
import { validateDate, validateLocation, validateTime } from "./validationUtils";

const ModalOverlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  z-index: 2000;
  opacity: ${(props) => (props.$isOpen ? 1 : 0)};
  visibility: ${(props) => (props.$isOpen ? "visible" : "hidden")};
  transition: opacity 0.25s ease-out;
`;

const ModalContent = styled.div<{ $isOpen: boolean }>`
  width: 100%;
  background-color: #f0f5fb;
  border-radius: 28px 28px 0 0;
  padding: 8px 20px 24px;
  transform: translateY(${(props) => (props.$isOpen ? "0" : "100%")});
  transition: transform 0.3s cubic-bezier(0.32, 0.94, 0.6, 1);
  box-sizing: border-box;
`;

const DragHandle = styled.div`
  width: 36px;
  height: 4px;
  background: #ccd4e0;
  border-radius: 2px;
  margin: 8px auto 16px;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: #2d78df;
  margin: 0 0 20px 0;
`;

const InputWrapper = styled.div`
  position: relative;
  margin-bottom: 24px;
  display: flex;
  gap: 12px;
  align-items: center;
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 14px 16px 14px 44px;
  border-radius: 14px;
  border: 1.5px solid #2d78df;
  background: #ffffff;
  font-size: 16px;
  color: #818c99;
  outline: none;

  &::placeholder {
    color: #b2b8bf;
  }
`;

const TimeInput = styled(StyledInput)`
  padding: 14px;
  text-align: center;
`;

const IconInside = styled.div`
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #818c99;
`;

const ApplyButton = styled.button`
  width: 100%;
  background: #2d78df;
  color: #ffffff;
  border: none;
  border-radius: 14px;
  padding: 14px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
`;

export interface FilterOption {
  id: string;
  label: string;
  selected?: boolean;
}

/** Маска даты: только цифры, точки расставляются сами -> "ДД.ММ.ГГГГ". */
function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += "." + d.slice(2, 4);
  if (d.length > 4) out += "." + d.slice(4, 8);
  return out;
}

/** Маска времени: только цифры, двоеточие само -> "ЧЧ:ММ". */
function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  let out = d.slice(0, 2);
  if (d.length > 2) out += ":" + d.slice(2, 4);
  return out;
}

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => void;
  onSave: () => void;
  title: string;
  children: ReactNode;
}

function FilterBottomSheet({ isOpen, onClose, onApply, title, children }: BaseModalProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "unset";
  }, [isOpen]);

  return (
    <ModalOverlay $isOpen={isOpen} onClick={onClose}>
      <ModalContent $isOpen={isOpen} onClick={(e) => e.stopPropagation()}>
        <DragHandle />
        <Title>{title}</Title>
        {children}
        <ApplyButton onClick={onApply}>Применить</ApplyButton>
      </ModalContent>
    </ModalOverlay>
  );
}

export const DateFilter = ({ onSave, ...props }: any) => {
  const [value, setValue] = useState("");
  const [hasError, setHasError] = useState(false);

  const handleApply = () => {
    if (validateDate(value)) {
      setHasError(false);
      onSave(value);
      props.onClose();
    } else {
      setHasError(true);
    }
  };

  return (
    <FilterBottomSheet {...props} title="Введите дату" onApply={handleApply}>
      <InputWrapper>
        <IconInside>
          <CalendarIcon />
        </IconInside>
        <StyledInput
          style={{ borderColor: hasError ? "red" : "#2d78df" }}
          type="text"
          inputMode="numeric"
          placeholder="26.06.2026"
          value={value}
          onChange={(e) => {
            setValue(maskDate(e.target.value));
            if (hasError) setHasError(false);
          }}
        />
      </InputWrapper>
      {hasError && (
        <span style={{ color: "red", fontSize: "12px" }}>Введите дату в формате ДД.ММ.ГГГГ</span>
      )}
    </FilterBottomSheet>
  );
};

export const LocationFilter = ({ onSave, ...props }: any) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const handleApply = () => {
    if (validateLocation(value)) {
      setError(false);
      onSave(value);
      props.onClose();
    } else {
      setError(true);
    }
  };

  return (
    <FilterBottomSheet {...props} title="Введите место" onApply={handleApply}>
      <InputWrapper>
        <StyledInput
          style={{ borderColor: error ? "red" : "#2d78df" }}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Город или район"
        />
        <IconInside>
          <LocationIcon />
        </IconInside>
      </InputWrapper>
    </FilterBottomSheet>
  );
};

export const TimeFilter = ({ onSave, ...props }: any) => {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hasError, setHasError] = useState(false);

  const handleApply = () => {
    if (validateTime(startTime) && validateTime(endTime)) {
      setHasError(false);
      onSave(startTime, endTime);
      props.onClose();
    } else {
      setHasError(true);
    }
  };

  return (
    <FilterBottomSheet {...props} title="Введите время" onApply={handleApply}>
      <InputWrapper>
        <TimeInput
          type="text"
          inputMode="numeric"
          placeholder="16:00"
          value={startTime}
          style={{ borderColor: hasError ? "red" : "#2d78df" }}
          onChange={(e) => {
            setStartTime(maskTime(e.target.value));
            if (hasError) setHasError(false);
          }}
        />
        <span style={{ color: "#818c99" }}>—</span>
        <TimeInput
          type="text"
          inputMode="numeric"
          placeholder="18:00"
          value={endTime}
          style={{ borderColor: hasError ? "red" : "#2d78df" }}
          onChange={(e) => {
            setEndTime(maskTime(e.target.value));
            if (hasError) setHasError(false);
          }}
        />
      </InputWrapper>

      {hasError && (
        <div
          style={{
            color: "#FF4C4C",
            fontSize: "12px",
            marginTop: "8px",
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          Введите корректное время (00:00 - 23:59)
        </div>
      )}
    </FilterBottomSheet>
  );
};

const ChipContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
`;

const Chip = styled.button<{ $selected: boolean }>`
  padding: 10px 16px;
  border-radius: 14px;
  border: none;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${(props) => (props.$selected ? "#2d78df" : "#ffffff")};
  color: ${(props) => (props.$selected ? "#ffffff" : "#818c99")};
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  &:active {
    transform: scale(0.96);
  }
`;

interface InterestsFilterProps {
  isOpen: boolean;
  onClose: () => void;
  //   onSave: () => void;
  options: FilterOption[];
  onToggle: (id: string) => void;
}

export const InterestsFilter = ({ options, onToggle, onApply, ...props }: any) => {
  return (
    <FilterBottomSheet {...props} title="Выберите свои интересы" onApply={onApply || props.onClose}>
      <ChipContainer>
        {options.map((option: any) => (
          <Chip key={option.id} $selected={option.selected} onClick={() => onToggle(option.id)}>
            {option.label}
          </Chip>
        ))}
      </ChipContainer>
    </FilterBottomSheet>
  );
};
