import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Button } from "@vkontakte/vkui";
import { eventsAPI, type Invitation } from "../../services/api";
import { useToast } from "../../components/Toast/ToastProvider";

/**
 * Управление приглашениями в закрытое событие (PROD-002).
 *
 * Секрет ссылки виден ровно один раз — в ответе на создание; в базе лежит
 * только его SHA-256. Поэтому «скопировать» доступно лишь у свежесозданной
 * ссылки, а у выданных раньше — только отзыв. Интерфейс это проговаривает,
 * иначе отсутствие кнопки выглядит как поломка.
 */

const Section = styled.section`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Heading = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--povod-text);
`;

const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--povod-text-secondary);
`;

const Fresh = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--povod-radius-sm);
  background: var(--povod-success-surface);
  color: var(--povod-text);
`;

const FreshLink = styled.code`
  font-size: 12px;
  word-break: break-all;
  color: var(--povod-text);
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Item = styled.li<{ $inactive: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--povod-border-strong);
  border-radius: var(--povod-radius-sm);
  opacity: ${(props) => (props.$inactive ? 0.55 : 1)};
`;

const ItemInfo = styled.div`
  flex-grow: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--povod-text-secondary);
`;

const RevokeButton = styled.button`
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 8px;
  min-height: 40px;
  font: inherit;
  font-size: 13px;
  color: var(--povod-danger);
  cursor: pointer;

  &:disabled {
    color: var(--povod-text-secondary);
    cursor: default;
  }
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: var(--povod-danger);
`;

function formatDate(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

/** Одной строкой: сколько раз перешли, до какого числа живёт, отозвана ли. */
function describe(invitation: Invitation): string {
  if (invitation.revokedAt) return `Отозвано ${formatDate(invitation.revokedAt)}`;
  const expired = invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now();
  if (expired) return `Истекло ${formatDate(invitation.expiresAt)}`;

  const uses =
    invitation.maxUses === undefined
      ? `переходов: ${invitation.usedCount}`
      : `использовано ${invitation.usedCount} из ${invitation.maxUses}`;
  const until = invitation.expiresAt ? `, действует до ${formatDate(invitation.expiresAt)}` : "";
  return `${uses}${until}`;
}

function isInactive(invitation: Invitation): boolean {
  if (invitation.revokedAt) return true;
  if (invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now()) return true;
  return invitation.maxUses !== undefined && invitation.usedCount >= invitation.maxUses;
}

export function InvitationManager({ eventId }: { eventId: string }) {
  const showToast = useToast();
  const [items, setItems] = useState<Invitation[]>([]);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await eventsAPI.listInvitations(eventId);
    if (response.data) setItems(response.data);
    else setError(response.error ?? "Не удалось загрузить приглашения");
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    const response = await eventsAPI.createInvitation(eventId);
    setBusy(false);
    if (!response.data) {
      setError(response.error ?? "Не удалось создать приглашение");
      return;
    }
    const link = `${window.location.origin}/page-1/${eventId}?invite=${encodeURIComponent(
      response.data.token,
    )}`;
    setFreshLink(link);
    await load();
  };

  const handleCopy = async () => {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      showToast("Ссылка скопирована", { type: "success" });
    } catch {
      showToast("Скопируйте ссылку вручную", { type: "error" });
    }
  };

  const handleRevoke = async (id: string) => {
    setBusy(true);
    setError(null);
    const response = await eventsAPI.revokeInvitation(eventId, id);
    setBusy(false);
    if (response.error) {
      setError(response.error);
      return;
    }
    // Отозванная ссылка могла быть той, что показана выше, — убираем её.
    setFreshLink(null);
    await load();
    showToast("Приглашение отозвано", { type: "success" });
  };

  return (
    <Section>
      <Heading>Приглашения</Heading>
      <Hint>
        Событие закрытое: посторонним оно не видно. Ссылка даёт увидеть его и записаться — больше
        ничего.
      </Hint>

      {freshLink && (
        <Fresh>
          <strong>Новая ссылка готова</strong>
          <FreshLink>{freshLink}</FreshLink>
          <Hint>
            Сохраните её сейчас — второй раз показать её нельзя, в базе хранится только хэш.
          </Hint>
          <Button size="s" onClick={handleCopy}>
            Скопировать
          </Button>
        </Fresh>
      )}

      <Button size="m" mode="secondary" loading={busy} disabled={busy} onClick={handleCreate}>
        Создать ссылку
      </Button>

      {items.length > 0 && (
        <List>
          {items.map((invitation) => (
            <Item key={invitation.id} $inactive={isInactive(invitation)}>
              <ItemInfo>
                <div>Выдано {formatDate(invitation.createdAt)}</div>
                <div>{describe(invitation)}</div>
              </ItemInfo>
              {!invitation.revokedAt && (
                <RevokeButton
                  type="button"
                  disabled={busy}
                  onClick={() => handleRevoke(invitation.id)}
                >
                  Отозвать
                </RevokeButton>
              )}
            </Item>
          ))}
        </List>
      )}

      {error && <ErrorText role="alert">{error}</ErrorText>}
    </Section>
  );
}
