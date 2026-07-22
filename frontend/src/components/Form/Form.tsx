import styled from "@emotion/styled";
import { useTheme } from "../../context/ThemeContext";
import { type ReactNode } from "react";

interface FormProps {
  children: ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  className?: string;
}

const StyledForm = styled.form<{ $mode: "light" | "dark" }>`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export const Form = ({ children, onSubmit, className }: FormProps) => {
  const { theme } = useTheme();

  return (
    <StyledForm $mode={theme} onSubmit={onSubmit} className={className}>
      {children}
    </StyledForm>
  );
};

const FormGroupContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

interface FormGroupProps {
  children: ReactNode;
  className?: string;
}

export const FormGroup = ({ children, className }: FormGroupProps) => (
  <FormGroupContainer className={className}>{children}</FormGroupContainer>
);

const StyledLabel = styled.label<{ $mode: "light" | "dark" }>`
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  display: block;
`;

interface LabelProps {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}

export const Label = ({ htmlFor, children, required }: LabelProps) => {
  const { theme } = useTheme();

  return (
    <StyledLabel htmlFor={htmlFor} $mode={theme}>
      {children}
      {required && <span style={{ color: "#dc2626" }}> *</span>}
    </StyledLabel>
  );
};

// Input component
const StyledInput = styled.input<{ $mode: "light" | "dark"; error?: boolean }>`
  padding: 10px 12px;
  border: 1px solid ${(props) => (props.error ? "#dc2626" : "#d0d5dd")};
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  background: #ffffff;
  color: var(--text-color);
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-color: ${(props) => (props.error ? "#dc2626" : "#2563eb")};
    box-shadow: ${(props) =>
      props.error ? "0 0 0 3px rgba(220, 38, 38, 0.15)" : "0 0 0 3px rgba(37, 99, 235, 0.15)"};
  }

  &::placeholder {
    color: #94a3b8;
  }

  &:disabled {
    background: #f5f7fb;
    cursor: not-allowed;
  }
`;

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = ({ error = false, ...props }: InputProps) => {
  const { theme } = useTheme();

  return <StyledInput $mode={theme} error={error} {...props} />;
};

const StyledTextarea = styled.textarea<{
  $mode: "light" | "dark";
  error?: boolean;
}>`
  padding: 10px 12px;
  border: 1px solid ${(props) => (props.error ? "#dc2626" : "#d0d5dd")};
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  background: #ffffff;
  color: var(--text-color);
  resize: vertical;
  min-height: 90px;
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-color: ${(props) => (props.error ? "#dc2626" : "#2563eb")};
    box-shadow: ${(props) =>
      props.error ? "0 0 0 3px rgba(220, 38, 38, 0.15)" : "0 0 0 3px rgba(37, 99, 235, 0.15)"};
  }

  &::placeholder {
    color: #94a3b8;
  }

  &:disabled {
    background: #f5f7fb;
    cursor: not-allowed;
  }
`;

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = ({ error = false, ...props }: TextareaProps) => {
  const { theme } = useTheme();

  return <StyledTextarea $mode={theme} error={error} {...props} />;
};

const ErrorContainer = styled.span<{ $mode: "light" | "dark" }>`
  font-size: 12px;
  color: #dc2626;
  display: block;
`;

interface ErrorMessageProps {
  children?: ReactNode;
}

export const ErrorMessage = ({ children }: ErrorMessageProps) => {
  const { theme } = useTheme();

  if (!children) return null;

  return <ErrorContainer $mode={theme}>{children}</ErrorContainer>;
};

export default Form;
