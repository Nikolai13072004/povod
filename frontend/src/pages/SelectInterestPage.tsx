import { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { Button, Title, Text, Input } from "@vkontakte/vkui";
import { Icon16Place } from "@vkontakte/icons";
import { useNavigate } from "react-router-dom";
import { sessionStore } from "../stores/sessionStore";
import { setStoredInterests } from "../storage";
import { useInterestForm } from "../components/ComponentShowcase/useInterestForm";

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 83vh;
  padding: 32px 20px;
  background: transparent;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionTitle = styled(Title)`
  color: #3388ee; 
  font-size: 22px !important;
`;

const ChipsFlex = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const ChipButton = styled.button<{ $selected: boolean }>`
  appearance: none;
  border: 1px solid ${(props) => (props.$selected ? "#3388ee" : "#e1e4e8")};
  border-radius: 12px;
  padding: 8px 16px;
  background: ${(props) => (props.$selected ? "#3388ee" : "#ffffff")};
  color: ${(props) => (props.$selected ? "#ffffff" : "#919cb5")};
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.95);
  }
`;

const Card = styled.div`
  background: #ffffff;
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
    background: #f2f3f5;
    // border: 1px solid #3388ee;
  }
`;

const RangeContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  .vkuiInput {
    flex: 1;
    background: #f2f3f5;
    border: 1px solid #3388ee;
    border-radius: 8px;
  }
`;

const Footer = styled.div`
  margin-top: auto;
  padding-top: 20px;
`;

const categories = [
  { id: "sport", label: "Спорт" },
  { id: "art", label: "Искусство" },
  { id: "travel", label: "Путешествие" },
  { id: "it", label: "IT" },
  { id: "games", label: "Компьютерные игры" },
  { id: "tech", label: "Технологии" },
  { id: "food", label: "Еда" },
  { id: "board_games", label: "Настольные игры" },
  { id: "science", label: "Наука" },
  { id: "music", label: "Музыка" },
  { id: "self_dev", label: "Саморазвитие" },
  { id: "edu", label: "Образование" },
  { id: "cinema", label: "Кино" },
  { id: "shopping", label: "Шопинг" },
  { id: "restaurant", label: "Ресторан" },
  { id: "museum", label: "Музей" },
  { id: "rest", label: "Отдых" },
];

export function SelectInterestPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  //   const [peopleFrom, setPeopleFrom] = useState("2");
  //   const [peopleTo, setPeopleTo] = useState("100");

  const {
    peopleFrom,
    setPeopleFrom,
    peopleTo,
    setPeopleTo,
    handleBlurFrom,
    handleBlurTo,
    isValid,
  } = useInterestForm();

  const navigate = useNavigate();

  // Онбординг показываем один раз — если уже пройден, сразу в ленту
  useEffect(() => {
    if (localStorage.getItem("onboarded") === "true") {
      navigate("/page-1", { replace: true });
    }
  }, [navigate]);

  const toggleCategory = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleContinue = () => {
    const labels = categories.filter((c) => selected.includes(c.id)).map((c) => c.label);
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
              fill="#919cb5"
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

      <Section>
        <Card>
          <SectionTitle level="2" style={{ fontSize: 18 }}>
            Количество человек
          </SectionTitle>
          <RangeContainer>
            <Input
              type="number"
              value={peopleFrom}
              onChange={(e) => setPeopleFrom(e.target.value)}
              onBlur={handleBlurFrom} 
            />
            <span style={{ color: "#919cb5" }}>—</span>
            <Input
              type="number"
              value={peopleTo}
              onChange={(e) => setPeopleTo(e.target.value)}
              onBlur={handleBlurTo}
            />
          </RangeContainer>
          {!isValid && (
            <Text style={{ color: "red", fontSize: 12 }}>Диапазон должен быть от 2 до 100</Text>
          )}
        </Card>
      </Section>

      <Footer>
        <Button
          size="l"
          stretched
          disabled={!isValid || selected.length === 0} 
          appearance="accent"
          style={{
            background: isValid ? "#3388ee" : "#ccc",
            borderRadius: 12,
            height: 52,
          }}
          onClick={handleContinue}
        >
          Продолжить
        </Button>
      </Footer>
    </PageContainer>
  );
}
