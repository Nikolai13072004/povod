import { useState } from "react";
import styled from "@emotion/styled";
import { Avatar, Button, Text } from "@vkontakte/vkui";
import { commentsAPI, type Comment } from "../../services/api";
import { avatarInitials } from "../../lib/avatarInitials";
import { useToast } from "../../components/Toast/ToastProvider";

/**
 * Комментарий с правкой и удалением (BE-009).
 *
 * Править может только автор реплики. Автор события может её удалить — это
 * модерация, — но не переписать: подменять чужие слова, оставляя чужое имя,
 * нельзя. Сервер проверяет то же самое.
 */

const Row = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
`;

const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

const AuthorName = styled.div`
  font-weight: 600;
  font-size: 14px;
`;

const Meta = styled.div`
  font-size: 12px;
  color: var(--vkui--color_text_secondary);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const MetaButton = styled.button`
  border: none;
  background: none;
  padding: 4px 2px;
  min-height: 32px;
  font: inherit;
  font-size: 12px;
  color: var(--povod-primary);
  cursor: pointer;

  &:disabled {
    color: var(--povod-text-secondary);
    cursor: default;
  }
`;

const EditArea = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  min-height: 68px;
  margin-top: 4px;
  padding: 10px 12px;
  border: 1px solid var(--povod-border-strong);
  border-radius: var(--povod-radius-sm);
  background: var(--povod-surface-muted);
  color: var(--povod-text);
  font: inherit;
  font-size: 14px;
  resize: vertical;
`;

const EditActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

const ErrorText = styled.div`
  margin-top: 6px;
  font-size: 12px;
  color: var(--povod-danger);
`;

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface CommentRowProps {
  comment: Comment;
  canEdit: boolean;
  canDelete: boolean;
  onSaved: (comment: Comment) => void;
  onDeleted: () => void;
}

export function CommentRow({ comment, canEdit, canDelete, onSaved, onDeleted }: CommentRowProps) {
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const text = draft.trim();
    if (!text || text === comment.text) {
      setEditing(false);
      setDraft(comment.text);
      return;
    }
    setBusy(true);
    setError(null);
    const response = await commentsAPI.update(comment.id, text);
    setBusy(false);
    if (!response.data) {
      setError(response.error ?? "Не удалось сохранить правку");
      return;
    }
    onSaved(response.data);
    setEditing(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    const response = await commentsAPI.delete(comment.id);
    setBusy(false);
    if (response.error) {
      setError(response.error);
      return;
    }
    onDeleted();
    showToast("Комментарий удалён", { type: "success" });
  };

  return (
    <Row>
      <Avatar
        size={36}
        src={comment.author?.avatar}
        initials={avatarInitials(comment.author?.avatar, comment.author?.name)}
      />
      <Body>
        <AuthorName>{comment.author?.name ?? "Гость"}</AuthorName>

        {editing ? (
          <>
            <EditArea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Текст комментария"
              autoFocus
            />
            <EditActions>
              <Button size="s" loading={busy} disabled={busy} onClick={handleSave}>
                Сохранить
              </Button>
              <Button
                size="s"
                mode="tertiary"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.text);
                  setError(null);
                }}
              >
                Отмена
              </Button>
            </EditActions>
          </>
        ) : (
          <Text style={{ fontSize: 14, overflowWrap: "break-word" }}>{comment.text}</Text>
        )}

        <Meta>
          <time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt)}</time>
          {/* Отметка о правке, а не молчаливая подмена: собеседники должны
              видеть, что реплика изменилась после публикации. */}
          {comment.editedAt && <span>изменён</span>}
          {!editing && canEdit && (
            <MetaButton type="button" onClick={() => setEditing(true)}>
              Изменить
            </MetaButton>
          )}
          {!editing && canDelete && (
            <MetaButton type="button" disabled={busy} onClick={handleDelete}>
              Удалить
            </MetaButton>
          )}
        </Meta>

        {error && <ErrorText role="alert">{error}</ErrorText>}
      </Body>
    </Row>
  );
}
