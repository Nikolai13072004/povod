import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Button, Title, Text, Input } from "@vkontakte/vkui";
import { Icon16Place } from "@vkontakte/icons";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { sessionStore } from "../stores/sessionStore";
import { setStoredInterests } from "../storage";
import { INTERESTS } from "../data/interests";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 83vh;
  min-height: 83dvh;
  padding: 32px 20px;
  background: transparent;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionTitle = styled(Title)`
  color: var(--povod-primary);
  font-size: clamp(18px, 5vw, 22px) !important;
`;

const ChipsFlex = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ChipButton = styled.button<{ $selected: boolean }>`
  appearance: none;
  border: 1px solid
    ${(props) => (props.$selected ? "var(--povod-primary)" : "var(--povod-border-strong)")};
  border-radius: 12px;
  padding: 8px 16px;
  background: ${(props) => (props.$selected ? "var(--povod-primary)" : "var(--povod-surface)")};
  color: ${(props) => (props.$selected ? "var(--povod-on-primary)" : "var(--povod-text-secondary)")};
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.95);
  }
`;

const Card = styled.div`
  background: var(--povod-surface);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InputWrapper = styled.div`
  position: relative;
  .vkuiInput__el {
    padding-left: 36px;
    background: var(--povod-surface-muted);
    // border: 1px solid var(--povod-primary);
  }
`;

const Footer = styled.div`
  margin-top: auto;
  padding-top: 20px;
`;

const categories = INTERESTS.map((label) => ({ id: label, label }));

/*
 * observer обязателен: эффект ниже зависит от `sessionStore.initialized`, а без
 * подписки на стор компонент не перерисуется, когда сессия подтвердится, — и
 * решение «пропускать онбординг или нет» так и останется принятым по пустому
 * профилю первого кадра.
 */
export const SelectInterestPage = observer(function SelectInterestPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();

  /*
   * Онбординг показывается один раз.
   *
   * Источник правды — профиль на сервере, а не флаг в localStorage. Выход из
   * аккаунта этот флаг стирал, и при следующем входе экран открывался ПУСТЫМ;
   * «Продолжить» отправлял выбранное, а сервер заменяет массив интересов
   * целиком — прежние стирались. То есть каждый повторный вход обнулял выбор.
   *
   * Если интересы уже есть, шаг пропускается. Если человек всё же сюда попал
   * (например, по прямой ссылке), поля заполняются текущими значениями, чтобы
   * «Продолжить» ничего не потеряло.
   */
  useEffect(() => {
    if (!sessionStore.initialized) return;

    const saved = sessionStore.user.interests ?? [];
    if (saved.length > 0) {
      localStorage.setItem("onboarded", "true");
      navigate("/page-1", { replace: true });
      return;
    }

    if (localStorage.getItem("onboarded") === "true") {
      navigate("/page-1", { replace: true });
      return;
    }

    setSelected(saved);
    setLocation(sessionStore.user.city ?? "");
  }, [navigate, sessionStore.initialized, sessionStore.user.id]);

  const toggleCategory = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  /**
   * Онбординг сохраняется на сервере.
   *
   * Раньше выбор уходил только в localStorage. Лента сортируется по интересам
   * из профиля (`preferInterests` на сервере), а там оставался пустой массив —
   * персонализация не включалась ни у кого, кто прошёл онбординг. Город
   * собирался и валидировался, но не записывался никуда.
   *
   * Флаг `onboarded` ставится только после успешного сохранения: иначе шаг
   * больше не повторить, а данные так и не дойдут до сервера.
   */
  const handleContinue = async () => {
    const labels = categories.filter((c) => selected.includes(c.id)).map((c) => c.label);
    const trimmedCity = location.trim();

    setSaving(true);
    setSaveError(null);
    const saved = await sessionStore.updateProfile({
      interests: labels,
      ...(trimmedCity ? { city: trimmedCity } : {}),
    });
    setSaving(false);

    if (!saved) {
      setSaveError(sessionStore.error ?? "Не удалось сохранить интересы. Попробуйте ещё раз");
      return;
    }

    setStoredInterests(sessionStore.user.id, labels);
    localStorage.setItem("isAuth", "true");
    localStorage.setItem("onboarded", "true");
    navigate("/page-1", { replace: true });
  };

  return (
    <PageContainer>
      <Section>
        <SectionTitle level="1" weight="2">
          Выберите свои интересы
        </SectionTitle>
        <ChipsFlex>
          {categories.map((cat) => (
            <ChipButton
              key={cat.id}
              $selected={selected.includes(cat.id)}
              onClick={() => toggleCategory(cat.id)}
            >
              {cat.label}
            </ChipButton>
          ))}
        </ChipsFlex>
      </Section>

      <Section>
        <Card>
          <SectionTitle level="2" style={{ fontSize: 18 }}>
            Место
          </SectionTitle>
          <InputWrapper>
            <Icon16Place
              fill="var(--povod-text-secondary)"
              style={{ position: "absolute", left: 12, top: 12, zIndex: 1 }}
            />
            <Input
              placeholder="Город или район"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </InputWrapper>
        </Card>
      </Section>

      <Footer>
        {saveError && (
          <Text
            role="alert"
            style={{ color: "var(--povod-danger)", fontSize: 13, marginBottom: 8 }}
          >
            {saveError}
          </Text>
        )}
        <Button
          size="l"
          stretched
          loading={saving}
          disabled={selected.length === 0 || saving}
          appearance="accent"
          style={{
            background: selected.length > 0 ? "var(--povod-primary)" : "var(--povod-border-strong)",
            borderRadius: 12,
            height: 52,
          }}
          onClick={() => void handleContinue()}
        >
          Продолжить
        </Button>
      </Footer>
    </PageContainer>
  );
});
