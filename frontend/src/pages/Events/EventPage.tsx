import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { eventStore } from "../../stores/EventStore";
import { commentsAPI, type Comment as ApiComment } from "../../services/api";
import { sessionStore } from "../../stores/sessionStore";
import { formatEventDate, formatEventTime } from "../../utils/eventDate";
import { useToast } from "../../components/Toast/ToastProvider";
import { EventOwnerControls } from "./EventOwnerControls";
import { downloadEventIcs } from "../../utils/calendar";
import { EventCover } from "../../components/EventCover/EventCover";
import { FavoriteButton } from "../../components/Favorite/FavoriteButton";
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
import { AsyncContent } from "../../components/AsyncContent";
import "@vkontakte/vkui/dist/vkui.css";
import styled from "@emotion/styled";

const CommentInput = styled.input`
  flex: 1;
  min-width: 0;
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
  const showToast = useToast();
  const [loading, setLoading] = useState(false);

  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    if (id) void eventStore.fetchEventById(id);
    return () => eventStore.clearActionError();
  }, [id]);

  const loadComments = useCallback(async () => {
    if (!id) return;
    setCommentsLoading(true);
    setCommentsError(null);
    const response = await commentsAPI.getByEvent(id);
    if (response.error || !response.data) {
      setCommentsError(response.error ?? "Сервер вернул пустой ответ");
    } else {
      setComments(response.data);
    }
    setCommentsLoading(false);
  }, [id]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const eventData = id ? eventStore.getById(id) : undefined;
  const detailLoading = id ? eventStore.isEventDetailLoading(id) : false;
  const detailLoaded = id ? eventStore.isEventDetailLoaded(id) : true;
  const detailNotFound = id ? eventStore.isEventDetailNotFound(id) : true;
  const detailError = id ? eventStore.getEventDetailError(id) : null;

  const isJoined = eventData
    ? eventData.participantIds?.includes(sessionStore.user.id) ||
      eventStore.acceptedEvents.some((item) => item.id === eventData.id)
    : false;

  /** Автор видит блок управления событием (FE-007); права всё равно проверяет сервер. */
  const isOwner = Boolean(eventData?.authorId && eventData.authorId === sessionStore.user.id);

  if (!eventData && (!detailLoaded || detailLoading)) {
    return (
      <Panel id="loading">
        <PanelHeader before={<PanelHeaderBack onClick={() => navigate(-1)} />}>Событие</PanelHeader>
        <Group>
          <AsyncContent loading empty={false} loadingTitle="Загружаем событие…" />
        </Group>
      </Panel>
    );
  }

  if (!eventData && detailError) {
    return (
      <Panel id="error">
        <PanelHeader before={<PanelHeaderBack onClick={() => navigate(-1)} />}>Событие</PanelHeader>
        <Group>
          <AsyncContent
            loading={false}
            error={detailError}
            empty={false}
            emptyTitle=""
            errorTitle="Не удалось открыть событие"
            onRetry={() => id && eventStore.fetchEventById(id, true)}
          />
        </Group>
      </Panel>
    );
  }

  if (!eventData && detailNotFound) {
    return (
      <Panel id="not-found">
        <PanelHeader before={<PanelHeaderBack onClick={() => navigate(-1)} />}>Событие</PanelHeader>
        <Group>
          <AsyncContent
            loading={false}
            empty
            emptyTitle="Событие не найдено"
            emptyDescription="Возможно, оно было удалено или доступ к нему ограничен."
          />
        </Group>
      </Panel>
    );
  }

  if (!eventData) return null;

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

  // «Пригласи одним кликом» — шеринг через VK Bridge, в браузере — фолбэк.
  // Делимся ссылкой на КОНКРЕТНОЕ событие: раньше уходила захардкоженная ссылка
  // на приложение, и получатель не попадал на нужный повод.
  const handleInvite = async () => {
    const link = `${window.location.origin}/page-1/${eventData.id}`;
    try {
      await bridge.send("VKWebAppShare", { link });
    } catch {
      if (navigator.share) {
        try {
          await navigator.share({ title: eventData.title, text: eventData.title, url: link });
          return;
        } catch {
          /* пользователь отменил шеринг */
        }
      }
      try {
        await navigator.clipboard.writeText(link);
        showToast("Ссылка на событие скопирована", { type: "success" });
      } catch {
        /* буфер обмена недоступен */
      }
    }
  };

  /** Экспорт события в календарь через .ics — работает без серверной части (PROD-010). */
  const handleAddToCalendar = () => {
    try {
      downloadEventIcs({
        id: eventData.id,
        title: eventData.title,
        description: eventData.description,
        location: eventData.place ?? eventData.location,
        startsAt: eventData.startsAt,
        url: `${window.location.origin}/page-1/${eventData.id}`,
      });
      showToast("Файл календаря скачан", { type: "success" });
    } catch {
      showToast("Не удалось создать файл календаря", { type: "error" });
    }
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text || posting || !id) return;
    setPosting(true);
    setCommentError(null);
    const res = await commentsAPI.create({ text, eventId: id });
    if (res.data) {
      setComments((prev) => [...prev, res.data as ApiComment]);
      setCommentText("");
    } else {
      setCommentError(res.error ?? "Не удалось отправить комментарий");
    }
    setPosting(false);
  };

  return (
    <Panel id="event-detail" style={{ marginBottom: "40px" }}>
      <PanelHeader before={<PanelHeaderBack onClick={() => navigate(-1)} />}>Событие</PanelHeader>

      <Group>
        <div style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
            <Title level="1" weight="1" style={{ minWidth: 0, flexGrow: 1 }}>
              {eventData.title}
            </Title>
            {/* Сердечко рядом с названием: на карточке события всплывать некуда. */}
            <FavoriteButton eventId={String(eventData.id)} stopPropagation={false} />
          </div>
          <Text style={{ color: "var(--vkui--color_text_secondary)" }}>
            {eventData.description}
          </Text>
          <div style={{ marginTop: 16 }}>
            <EventCover
              src={typeof eventData.image === "string" ? eventData.image : undefined}
              title={eventData.title}
              rounded="12px"
            />
          </div>
        </div>

        <Spacing size={16} />

        <SimpleCell before={<Icon28CalendarOutline />} subtitle="Дата и время">
          {formatEventDate(eventData.startsAt, eventData.timezone)} в{" "}
          {formatEventTime(eventData.startsAt, eventData.timezone)}
        </SimpleCell>

        <SimpleCell before={<Icon28PlaceOutline />} subtitle="Место проведения">
          {eventData.place ?? eventData.location}
        </SimpleCell>

        <SimpleCell before={<Icon28UsersOutline />} subtitle="Участники">
          {participants} человек
        </SimpleCell>

        {eventData.authorId && (
          <SimpleCell
            subtitle="Организатор"
            onClick={() => navigate(`/users/${eventData.authorId}`)}
            aria-label={`Профиль организатора: ${eventData.author ?? "пользователь"}`}
          >
            {eventData.author ?? "Пользователь"}
          </SimpleCell>
        )}

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

        {isOwner && (
          <div style={{ padding: "0 16px" }}>
            <EventOwnerControls event={eventData} onDeleted={() => navigate("/page-1")} />
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
                style={{ background: "var(--povod-danger)", color: "white" }}
              >
                Отписаться
              </Button>
            </>
          )}

          {eventStore.actionError && (
            <Text
              role="alert"
              style={{
                color: "var(--vkui--color_text_negative)",
                marginTop: 10,
                textAlign: "center",
              }}
            >
              {eventStore.actionError}
            </Text>
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

          <div style={{ height: 8 }} />
          <Button
            size="l"
            stretched
            mode="tertiary"
            before={<Icon28CalendarOutline width={20} height={20} />}
            onClick={handleAddToCalendar}
          >
            Добавить в календарь
          </Button>
        </div>

        <Separator />

        <div style={{ padding: "16px" }}>
          <Title level="3" weight="2" style={{ marginBottom: 14 }}>
            Комментарии ({comments.length})
          </Title>

          <AsyncContent
            loading={commentsLoading}
            error={commentsError}
            empty={comments.length === 0}
            loadingTitle="Загружаем комментарии…"
            errorTitle="Не удалось загрузить комментарии"
            emptyTitle="Пока нет комментариев"
            emptyDescription="Будьте первым, кто начнёт обсуждение."
            onRetry={loadComments}
            compact
          >
            {comments.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <Avatar size={36} src={c.author?.avatar} initials={c.author?.name?.[0]} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.author?.name ?? "Гость"}</div>
                  <Text style={{ fontSize: 14, overflowWrap: "break-word" }}>{c.text}</Text>
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
          </AsyncContent>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <CommentInput
              placeholder="Написать комментарий…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddComment();
              }}
            />
            <Button
              size="l"
              loading={posting}
              disabled={!commentText.trim()}
              onClick={handleAddComment}
            >
              Отправить
            </Button>
          </div>
          {commentError && (
            <Text role="alert" style={{ color: "var(--vkui--color_text_negative)", marginTop: 8 }}>
              {commentError}
            </Text>
          )}
        </div>
      </Group>
    </Panel>
  );
}

export const EventPage = observer(EventPageComponent);
