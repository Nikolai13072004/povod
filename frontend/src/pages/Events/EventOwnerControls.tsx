import { useState } from "react";
import styled from "@emotion/styled";
import { Button, Input, Textarea } from "@vkontakte/vkui";
import { eventStore, type IEvent } from "../../stores/EventStore";
import { useToast } from "../../components/Toast/ToastProvider";
import { browserTimezone, localDateTimeToIso } from "../../utils/eventDate";

const Panel = styled.div`
  display: grid;
  gap: 10px;
  padding: 16px;
  margin-top: 12px;
  background: var(--vkui--color_background_secondary);
  border-radius: var(--povod-radius-lg);
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--vkui--color_text_primary);
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  > * {
    flex: 1 1 140px;
    min-width: 0;
  }
`;

const FieldLabel = styled.label`
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--vkui--color_text_secondary);
`;

const DangerText = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  color: var(--vkui--color_text_primary);
  overflow-wrap: anywhere;
`;

const ErrorText = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--vkui--color_text_negative, var(--povod-danger));
  overflow-wrap: anywhere;
`;

/** Локальные дата и время события в часовом поясе события — для полей формы. */
function localParts(event: IEvent): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: event.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(event.startsAt));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

interface EventOwnerControlsProps {
  event: IEvent;
  /** Вызывается после успешного удаления — страница события больше не существует. */
  onDeleted: () => void;
}

/**
 * Управление собственным событием: редактирование и удаление (FE-007).
 * Показывается только автору; права всё равно проверяет сервер.
 */
export function EventOwnerControls({ event, onDeleted }: EventOwnerControlsProps) {
  const showToast = useToast();
  const initial = localParts(event);

  const [mode, setMode] = useState<"idle" | "edit" | "confirm-delete">("idle");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.place ?? event.location ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setTitle(event.title);
    setDescription(event.description ?? "");
    setLocation(event.place ?? event.location ?? "");
    setDate(initial.date);
    setTime(initial.time);
    setError(null);
  };

  const handleSave = async () => {
    if (busy) return;
    setError(null);
    if (!title.trim() || !date || !location.trim()) {
      setError("Заполните название, дату и место события.");
      return;
    }

    const timezone = event.timezone || browserTimezone();
    let startsAt: string;
    try {
      startsAt = localDateTimeToIso(date, time, timezone);
    } catch (dateError) {
      setError(dateError instanceof Error ? dateError.message : "Некорректные дата и время");
      return;
    }

    setBusy(true);
    const updated = await eventStore.updateEvent(event.id, {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      startsAt,
      timezone,
    });
    setBusy(false);

    if (updated) {
      setMode("idle");
      showToast("Событие обновлено", { type: "success" });
    } else {
      setError(eventStore.actionError ?? "Не удалось сохранить изменения");
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    const removed = await eventStore.deleteEvent(event.id);
    setBusy(false);

    if (removed) {
      showToast("Событие удалено", { type: "success" });
      onDeleted();
    } else {
      setError(eventStore.actionError ?? "Не удалось удалить событие");
      setMode("idle");
    }
  };

  if (mode === "edit") {
    return (
      <Panel>
        <PanelTitle>Редактирование события</PanelTitle>

        <div>
          <FieldLabel htmlFor="event-title">Название</FieldLabel>
          <Input
            id="event-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название события"
          />
        </div>

        <div>
          <FieldLabel htmlFor="event-description">Описание</FieldLabel>
          <Textarea
            id="event-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Чего ожидать участникам"
          />
        </div>

        <div>
          <FieldLabel htmlFor="event-location">Место</FieldLabel>
          <Input
            id="event-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Адрес или ссылка"
          />
        </div>

        <Row>
          <div>
            <FieldLabel htmlFor="event-date">Дата</FieldLabel>
            <Input
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="event-time">Время начала</FieldLabel>
            <Input
              id="event-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </Row>

        {error && <ErrorText role="alert">{error}</ErrorText>}

        <Row>
          <Button size="l" mode="primary" loading={busy} disabled={busy} onClick={handleSave}>
            Сохранить
          </Button>
          <Button
            size="l"
            mode="secondary"
            disabled={busy}
            onClick={() => {
              resetForm();
              setMode("idle");
            }}
          >
            Отмена
          </Button>
        </Row>
      </Panel>
    );
  }

  if (mode === "confirm-delete") {
    return (
      <Panel>
        <PanelTitle>Удалить событие?</PanelTitle>
        <DangerText>
          «{event.title}» будет удалено безвозвратно вместе с комментариями и записями участников.
        </DangerText>
        {error && <ErrorText role="alert">{error}</ErrorText>}
        <Row>
          <Button
            size="l"
            loading={busy}
            disabled={busy}
            onClick={handleDelete}
            style={{ background: "var(--povod-danger)", color: "var(--povod-surface)" }}
          >
            Удалить
          </Button>
          <Button size="l" mode="secondary" disabled={busy} onClick={() => setMode("idle")}>
            Отмена
          </Button>
        </Row>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelTitle>Вы автор этого события</PanelTitle>
      {error && <ErrorText role="alert">{error}</ErrorText>}
      <Row>
        <Button size="l" mode="secondary" onClick={() => setMode("edit")}>
          Редактировать
        </Button>
        <Button size="l" mode="outline" onClick={() => setMode("confirm-delete")}>
          Удалить
        </Button>
      </Row>
    </Panel>
  );
}
