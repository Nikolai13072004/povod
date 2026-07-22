import { observer } from "mobx-react-lite";
import { type ReactNode } from "react";
import { Button as VKUIButton } from "@vkontakte/vkui";

type ButtonVariant = "primary" | "secondary" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  fullWidth?: boolean;
}

const modeMap: Record<ButtonVariant, "primary" | "secondary"> = {
  primary: "primary",
  secondary: "secondary",
  danger: "primary",
  success: "primary",
};

const appearanceMap: Record<ButtonVariant, "accent" | "neutral" | "negative" | "positive"> = {
  primary: "accent",
  secondary: "neutral",
  danger: "negative",
  success: "positive",
};

const sizeMap: Record<ButtonSize, "s" | "m" | "l"> = {
  sm: "s",
  md: "m",
  lg: "l",
};

const Button = observer(
  ({
    children,
    variant = "primary",
    size = "md",
    disabled = false,
    onClick,
    type = "button",
    fullWidth = false,
  }: ButtonProps) => {
    return (
      <VKUIButton
        mode={modeMap[variant]}
        appearance={appearanceMap[variant]}
        size={sizeMap[size]}
        stretched={fullWidth}
        disabled={disabled}
        onClick={onClick}
        type={type}
      >
        {children}
      </VKUIButton>
    );
  },
);

export { Button };
export default Button;
