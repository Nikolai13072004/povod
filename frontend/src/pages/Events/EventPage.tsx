import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { eventStore } from "../../stores/EventStore";
import { commentsAPI, type Comment as ApiComment } from "../../services/api";
import { sessionStore } from "../../stores/sessionStore";
import bridge from "@vkontakte/vk-bridge";
import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  SimpleCell,
  Button,
  Text,
  Title,
  Spacing,
  Separator,
  Spinner,
  Avatar,
} from "@vkontakte/vkui";
import {
  Icon28CalendarOutline,
  Icon28PlaceOutline,
  Icon28UsersOutline,
  Icon24Done,
  Icon28ShareOutline,
} from "@vkontakte/icons";
import { EventMap } from "../../components/EventMap/EventMap";
import "@vkontakte/vkui/dist/vkui.css";
import styled from "@emotion/styled";

const EventImage = styled.img`
  width: 100%;
  height: 240px;
  object-fit: cover;
  border-radius: 12px;
  display: block;
  margin-bottom: 16px;
`;

const CommentInput = styled.input`
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--vkui--color_separator_primary_alpha);
  border-radius: 12px;
  background: var(--vkui--color_background_secondary);
  color: var(--vkui--color_text_primary);
  font-size: 14px;
  outline: none;
  &:focus {
    border-color: var(--vkui--color_background_accent);
  }
`;

function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EventPageComponent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    eventStore.fetchEvents();
  }, []);

  useEffect(() => {
    if (!id) return;
    commentsAPI.getByEvent(id).then((res) => {
      if (res.data) setComments(res.data);
    });
  }, [id]);

  const eventData = id ? eventStore.getById(id) : undefined;

  const isJoined = eventData
    ? eventStore.acceptedEvents.some((item) => item.id === eventData.id)
    : false;

  // Пока лента грузится и события ещё нет — показываем спиннер
  if (!eventData && eventStore.isLoading) {
    return (
      <Panel id="loading">
        <PanelHeader before={<PanelHeaderBack onClick={() => navigate(-1)} />}>Событие</PanelHeader>
        <Group>
          <div style={{ padding: 48, display: "flex", justifyContent: "center" }}>
            <Spinner size="l" />
          </div>
        </Group>
      </Panel>
    );
  }

  if (!eventData) {
    return (
      <Panel id="error">
        <PanelHeader before={<PanelHeaderBack onClick={() => navigate(-1)} />}>Ошибка</PanelHeader>
        <Group>
          <div style={{ padding: 20, textAlign: "center" }}>
            <Title level="2">Событие не найдено</Title>
            <Spacing size={16} />
            <Button size="l" onClick={() => navigate(-1)}>
              Вернуться к списку
            </Button>
          </div>
        </Group>
      </Panel>
    );
  }

  const participants = eventData.participants ?? 0;

  const handleJoin = async () => {
    if (isJoined) return;
    setLoading(true);
    await eventStore.join(eventData);
    setLoading(false);
  };

  const handleLeave = async () => {
    if (!isJoined) return;
    setLoading(true);
    await eventStore.leave(eventData);
    setLoading(false);
  };

  // «Пригласи одним кликом» — шеринг через VK Bridge, в браузере — фолбэк
  const handleInvite = async () => {
    const link = "https://vk.com/app54645823";
    try {
      await bridge.send("VKWebAppShare", { link });
    } catch {
      if (navigator.share) {
        try {
          await navigator.share({ title: "POVOD", text: eventData.title, url: link });
          return;
        } catch {
          /* пользователь отменил шеринг */
        }
      }
      try {
        await navigator.clipboard.writeText(link);
        alert("Ссылка на приложение скопирована:\n" + link);
      } catch {
        /* буфер обмена недоступен */
      }
    }
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text || posting || !id) return;
    setPosting(true);
    const res = await commentsAPI.create({ text, eventId: id, author: sessionStore.user });
    if (res.data) {
      setComments((prev) => [...prev, res.data as ApiComment]);
      setCommentText("");
    }
    setPosting(false);
  };

  return (
    <Panel id="event-detail" style={{ marginBottom: "40px" }}>
      <PanelHeader before={<PanelHeaderBack onClick={() => navigate(-1)} />}>Событие</PanelHeader>

      <Group>
        <div style={{ padding: "16px" }}>
          <Title level="1" weight="1" style={{ marginBottom: 8 }}>
            {eventData.title}
          </Title>
          <Text style={{ color: "var(--vkui--color_text_secondary)" }}>
            {eventData.description}
          </Text>
          {eventData.image && (
            <EventImage
              src={typeof eventData.image === "string" ? eventData.image : ""}
              alt={eventData.title}
              style={{ marginTop: 16 }}
            />
          )}
        </div>

        <Spacing size={16} />

        <SimpleCell before={<Icon28CalendarOutline />} subtitle="Дата и время">
          {eventData.date} в {eventData.time}
        </SimpleCell>

        <SimpleCell before={<Icon28PlaceOutline />} subtitle="Место проведения">
          {eventData.place ?? eventData.location}
        </SimpleCell>

        <SimpleCell before={<Icon28UsersOutline />} subtitle="Участники">
          {participants} человек
        </SimpleCell>

        <Spacing size={12} />
        <Separator />

        {eventData.coords && (
          <div style={{ padding: "12px 16px" }}>
            <Title level="3" weight="2" style={{ marginBottom: 12 }}>
              Место на карте
            </Title>
            <EventMap coords={eventData.coords} />
          </div>
        )}

        <div style={{ padding: "12px 16px" }}>
          {!isJoined ? (
            <Button size="l" stretched loading={loading} onClick={handleJoin} mode="primary">
              Записаться
            </Button>
          ) : (
            <>
              <Button size="l" stretched mode="secondary" before={<Icon24Done />} disabled>
                Вы записаны
              </Button>
              <div style={{ height: 8 }} />
              <Button
                size="l"
                stretched
                loading={loading}
                onClick={handleLeave}
                style={{ background: "#e05b5b", color: "white" }}
              >
                Отписаться
              </Button>
            </>
          )}

          <div style={{ height: 8 }} />
          <Button
            size="l"
            stretched
            mode="outline"
            before={<Icon28ShareOutline width={20} height={20} />}
            onClick={handleInvite}
          >
            Пригласить друзей
          </Button>
        </div>

        <Separator />

        <div style={{ padding: "16px" }}>
          <Title level="3" weight="2" style={{ marginBottom: 14 }}>
            Комментарии ({comments.length})
          </Title>

          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <Avatar size={36} src={c.author?.avatar} initials={c.author?.name?.[0]} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.author?.name ?? "Гость"}</div>
                <Text style={{ fontSize: 14 }}>{c.text}</Text>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--vkui--color_text_secondary)",
                    marginTop: 2,
                  }}
                >
                  {formatCommentDate(c.createdAt)}
                </div>
              </div>
            </div>
          ))}

          {comments.length === 0 && (
            <Text style={{ color: "var(--vkui--color_text_secondary)" }}>
              Пока нет комментариев — будь первым!
            </Text>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <CommentInput
              placeholder="Написать комментарий…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddComment();
              }}
            />
            <Button size="m" loading={posting} disabled={!commentText.trim()} onClick={handleAddComment}>
              Отправить
            </Button>
          </div>
        </div>
      </Group>
    </Panel>
  );
}

export const EventPage = observer(EventPageComponent);
