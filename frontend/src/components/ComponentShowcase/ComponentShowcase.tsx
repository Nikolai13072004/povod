import { useState } from "react";
import styled from "@emotion/styled";
import { Button } from "../Button";
import { Form, FormGroup, Label, Input, Textarea, ErrorMessage } from "../Form";
import { Modal } from "../Modal";
import { useTheme } from "../../context/ThemeContext";

const ComponentShowcaseContainer = styled.div<{ $mode: "light" | "dark" }>`
  background: var(--bg-color);
  padding: 32px;
  border-radius: 12px;
  display: grid;
  gap: 40px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionTitle = styled.h2<{ $mode: "light" | "dark" }>`
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color);
  margin: 0;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(0, 0, 0, 0.08);
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const FormSection = styled.div<{ $mode: "light" | "dark" }>`
  background: var(--bg-color);
  padding: 20px;
  border-radius: 8px;
`;

export const ComponentShowcase = () => {
  const { theme } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!formData.name) errors.name = "Введите имя";
    if (!formData.email) errors.email = "Введите email";
    // if (!formData.message) errors.message = "Введите сообщение";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    console.log("Form submitted:", formData);
    alert("Форма отправлена!");
    setFormData({ name: "", email: "", message: "" });
  };

  return (
    <ComponentShowcaseContainer $mode={theme}>
      <Section>
        <SectionTitle $mode={theme}>Кнопки</SectionTitle>
        <ButtonGroup>
          <Button variant="primary" size="sm">
            Маленькая
          </Button>
          <Button variant="primary">Обычная</Button>
          <Button variant="primary" size="lg">
            Большая
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Удалить</Button>
          <Button variant="success">Сохранить</Button>
          <Button disabled>Отключена</Button>
          <Button variant="primary" fullWidth>
            Полная ширина
          </Button>
        </ButtonGroup>
      </Section>

      <Section>
        <SectionTitle $mode={theme}>Форма</SectionTitle>
        <FormSection $mode={theme}>
          <Form onSubmit={handleFormSubmit}>
            <FormGroup>
              <Label htmlFor="name" required>
                Ваше имя
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Введите имя"
                value={formData.name}
                onChange={handleFormChange}
                error={!!formErrors.name}
              />
              <ErrorMessage>{formErrors.name}</ErrorMessage>
            </FormGroup>

            <FormGroup>
              <Label htmlFor="email" required>
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="example@email.com"
                value={formData.email}
                onChange={handleFormChange}
                error={!!formErrors.email}
              />
              <ErrorMessage>{formErrors.email}</ErrorMessage>
            </FormGroup>

            <FormGroup>
              <Label htmlFor="message" required>
                Сообщение
              </Label>
              <Textarea
                id="message"
                name="message"
                placeholder="Напишите сообщение..."
                value={formData.message}
                onChange={handleFormChange}
                error={!!formErrors.message}
              />
              <ErrorMessage>{formErrors.message}</ErrorMessage>
            </FormGroup>

            <div style={{ display: "flex", gap: "12px" }}>
              <Button type="submit" variant="primary">
                Отправить
              </Button>
              <Button
                type="reset"
                variant="secondary"
                onClick={() => setFormData({ name: "", email: "", message: "" })}
              >
                Очистить
              </Button>
            </div>
          </Form>
        </FormSection>
      </Section>

      <Section>
        <SectionTitle $mode={theme}>Модальное окно</SectionTitle>
        <ButtonGroup>
          <Button onClick={() => setIsModalOpen(true)}>Открыть модальное окно</Button>
        </ButtonGroup>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Пример модального окна"
          footer={
            <div style={{ display: "flex", gap: "12px" }}>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setIsModalOpen(false);
                  alert("Подтверждено!");
                }}
              >
                Подтвердить
              </Button>
            </div>
          }
        >
          <p>
            Это пример модального окна с кнопками. Вы можете закрыть его, нажав на кнопку, нажав на
            кнопку закрытия или нажав Escape.
          </p>
          <p>Окно в светлом оформлении.</p>
        </Modal>
      </Section>
    </ComponentShowcaseContainer>
  );
};

export default ComponentShowcase;
