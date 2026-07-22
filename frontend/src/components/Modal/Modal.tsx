import styled from "@emotion/styled";
import { useTheme } from "../../context/ThemeContext";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

const Overlay = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${(props) => (props.isOpen ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0)")};
  display: flex;
  align-items: center;
  justify-content: center;
  visibility: ${(props) => (props.isOpen ? "visible" : "hidden")};
  transition:
    background-color 0.3s ease,
    visibility 0.3s ease;
  z-index: 10000;
`;

const getSizeStyles = (size: "sm" | "md" | "lg") => {
  const sizes = {
    sm: "max-width: 400px;",
    md: "max-width: 600px;",
    lg: "max-width: 800px;",
  };
  return sizes[size];
};

const ModalContent = styled.div<{
  $mode: "light" | "dark";
  size: "sm" | "md" | "lg";
}>`
  background: #ffffff !important;
  color: #1d1d1d !important;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
  ${(props) => getSizeStyles(props.size)}
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease;

  @keyframes slideIn {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
`;

const ModalHeader = styled.div<{ $mode: "light" | "dark" }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
`;

const CloseButton = styled.button<{ $mode: "light" | "dark" }>`
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-color);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text-color);
  }
`;

const ModalBody = styled.div`
  padding: 24px;
  flex: 1;
`;

const ModalFooter = styled.div<{ $mode: "light" | "dark" }>`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
`;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeOnBackdrop?: boolean;
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
}: ModalProps) => {
  const { theme } = useTheme();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };
  return createPortal(
    <Overlay
      isOpen={isOpen}
      onClick={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}
    >
      <ModalContent $mode={theme} size={size} style={{ position: "relative", zIndex: 10001 }}>
        {title && (
          <ModalHeader $mode={theme}>
            <ModalTitle>{title}</ModalTitle>
            <CloseButton $mode={theme} onClick={onClose}>
              ✕
            </CloseButton>
          </ModalHeader>
        )}
        <ModalBody>{children}</ModalBody>
        {footer && <ModalFooter $mode={theme}>{footer}</ModalFooter>}
      </ModalContent>
    </Overlay>,
    document.body,
  );
};

export default Modal;
