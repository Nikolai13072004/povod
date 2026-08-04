import { useCallback, useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Avatar, Button } from "@vkontakte/vkui";
import { usersAPI, type User } from "../../services/api";
import { avatarInitials } from "../../lib/avatarInitials";
import { useToast } from "../../components/Toast/ToastProvider";

/**
 * Заявки в друзья (SEC-012).
 *
 * До этого нажатие «добавить в друзья» немедленно меняло запись второго
 * человека: его не спрашивали, и узнать об этом он мог, только открыв профиль.
 * Теперь связь возникает только после согласия, и этому нужно место в
 * интерфейсе — иначе заявки некуда принимать.
 *
 * Исходящие показываются рядом со входящими намеренно: без них непонятно,
 * ушла ли заявка вообще, и человек жмёт «добавить» повторно.
 */

const Section = styled.section`
  padding: 0 16px 16px;
`;

const Heading = styled.h2`
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--vkui--color_text_primary);
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
`;

const Name = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 15px;
  color: var(--vkui--color_text_primary);
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;
`;

const Muted = styled.span`
  font-size: 13px;
  color: var(--povod-text-secondary);
`;

interface FriendRequestsProps {
  userId: string;
  /** Дружба принята — родителю нужно перечитать список друзей. */
  onAccepted: () => void;
}

export function FriendRequests({ userId, onAccepted }: FriendRequestsProps) {
  const showToast = useToast();
  const [incoming, setIncoming] = useState<User[]>([]);
  const [outgoing, setOutgoing] = useState<User[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await usersAPI.getFriendRequests(userId);
    if (!response.data) return;
    setIncoming(response.data.incoming);
    setOutgoing(response.data.outgoing);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async (requester: User) => {
    setBusy(requester.id);
    const response = await usersAPI.acceptFriendRequest(userId, requester.id);
    setBusy(null);
    if (response.error) {
      showToast(response.error, { type: "error" });
      return;
    }
    showToast(`${requester.name} теперь у вас в друзьях`, { type: "success" });
    await load();
    onAccepted();
  };

  /** Отклонение входящей и отзыв своей — одно действие: убрать связь. */
  const remove = async (user: User, kind: "incoming" | "outgoing") => {
    setBusy(user.id);
    const response = await usersAPI.removeFriend(userId, user.id);
    setBusy(null);
    if (response.error) {
      showToast(response.error, { type: "error" });
      return;
    }
    showToast(kind === "incoming" ? "Заявка отклонена" : "Заявка отозвана");
    await load();
    // Родитель обязан узнать и об этом: связь изменилась, счётчик друзей тоже.
    onAccepted();
  };

  // Пустой блок не рисуем: у большинства заявок нет, и заголовок «Заявки (0)»
  // был бы шумом на каждом открытии профиля.
  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <Section>
      {incoming.length > 0 && (
        <>
          <Heading>Заявки в друзья ({incoming.length})</Heading>
          {incoming.map((user) => (
            <Row key={user.id}>
              <Avatar
                size={40}
                src={user.avatar}
                initials={avatarInitials(user.avatar, user.name)}
              />
              <Name>{user.name}</Name>
              <Actions>
                <Button
                  size="s"
                  mode="primary"
                  loading={busy === user.id}
                  disabled={busy !== null}
                  onClick={() => void accept(user)}
                >
                  Принять
                </Button>
                <Button
                  size="s"
                  mode="tertiary"
                  disabled={busy !== null}
                  onClick={() => void remove(user, "incoming")}
                >
                  Отклонить
                </Button>
              </Actions>
            </Row>
          ))}
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <Heading style={{ marginTop: incoming.length > 0 ? 16 : 0 }}>Вы отправили</Heading>
          {outgoing.map((user) => (
            <Row key={user.id}>
              <Avatar
                size={40}
                src={user.avatar}
                initials={avatarInitials(user.avatar, user.name)}
              />
              <Name>{user.name}</Name>
              <Muted>ждёт ответа</Muted>
              <Actions>
                <Button
                  size="s"
                  mode="tertiary"
                  disabled={busy !== null}
                  onClick={() => void remove(user, "outgoing")}
                >
                  Отозвать
                </Button>
              </Actions>
            </Row>
          ))}
        </>
      )}
    </Section>
  );
}
