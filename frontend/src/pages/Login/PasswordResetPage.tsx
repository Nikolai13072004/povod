import { useState } from "react";
import styled from "@emotion/styled";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authAPI } from "../../services/api";

/**
 * Восстановление пароля (SEC-008).
 *
 * Один экран на два шага: без токена в адресе — форма запроса ссылки, с токеном
 * — форма нового пароля. Разводить их по двум маршрутам незачем: пользователь
 * приходит на второй по ссылке из письма и первый в этот момент не видит.
 */

/*
 * Отступом, а не `min-height: 100dvh`. Полная высота экрана внутри контейнера,
 * у которого есть свои отступы, всегда даёт лишние пиксели — страница начинала
 * прокручиваться на пустом месте. Отступ сверху держит карточку в удобной зоне
 * и на телефоне, и на широком экране, а прокрутки не появляется вовсе.
 */
const Page = styled.main`
  display: grid;
  place-items: start center;
  padding: clamp(24px, 12vh, 96px) 16px 32px;
  background: var(--povod-bg);
`;

const Card = styled.form`
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  border-radius: var(--povod-radius-lg);
  background: var(--povod-surface);
  box-shadow: var(--povod-shadow-card);
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  color: var(--povod-text);
`;

const Hint = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--povod-text-secondary);
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid var(--povod-border-strong);
  border-radius: var(--povod-radius-sm);
  background: var(--povod-surface-muted);
  color: var(--povod-text);
  font-size: 16px;
`;

const Submit = styled.button`
  min-height: 48px;
  border: none;
  border-radius: var(--povod-radius-sm);
  background: var(--povod-primary);
  color: var(--povod-on-primary);
  font: inherit;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    background: var(--povod-border-strong);
    cursor: default;
  }
`;

const Link = styled.button`
  border: none;
  background: none;
  padding: 8px;
  min-height: 40px;
  color: var(--povod-primary);
  font: inherit;
  cursor: pointer;
`;

const Message = styled.p<{ $error?: boolean }>`
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: ${(props) => (props.$error ? "var(--povod-danger)" : "var(--povod-text-secondary)")};
`;

export default function PasswordResetPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await authAPI.requestPasswordReset(email);
    setSubmitting(false);
    // 503 — восстановление отключено на сервере; это единственный случай, когда
    // молчать нельзя, иначе человек будет ждать письма, которого не будет.
    if (response.status === 503) {
      setError(response.error ?? "Восстановление пароля сейчас недоступно");
      return;
    }
    if (response.status === 0 || response.status >= 500) {
      setError(response.error ?? "Не удалось отправить запрос");
      return;
    }
    setRequested(true);
  };

  const handleConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await authAPI.confirmPasswordReset(token ?? "", password);
    setSubmitting(false);
    if (response.error) {
      setError(response.error);
      return;
    }
    navigate("/", { replace: true });
  };

  if (token) {
    return (
      <Page>
        <Card onSubmit={handleConfirm}>
          <Title>Новый пароль</Title>
          <Hint>
            После смены пароля вход на всех устройствах потребуется заново — так безопаснее, если
            доступ к аккаунту получил кто-то ещё.
          </Hint>
          <Input
            type="password"
            placeholder="Новый пароль"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <Message $error>{error}</Message>}
          <Submit type="submit" disabled={submitting}>
            {submitting ? "Сохраняем…" : "Сохранить пароль"}
          </Submit>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card onSubmit={handleRequest}>
        <Title>Восстановление пароля</Title>
        {requested ? (
          <Message>
            Если такой адрес зарегистрирован, мы отправили на него ссылку для смены пароля. Она
            действует час.
          </Message>
        ) : (
          <>
            <Hint>Укажите адрес, на который зарегистрирован аккаунт.</Hint>
            <Input
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {error && <Message $error>{error}</Message>}
            <Submit type="submit" disabled={submitting}>
              {submitting ? "Отправляем…" : "Прислать ссылку"}
            </Submit>
          </>
        )}
        <Link type="button" onClick={() => navigate("/")}>
          Вернуться ко входу
        </Link>
      </Card>
    </Page>
  );
}
