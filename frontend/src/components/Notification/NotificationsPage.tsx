import { useState } from "react";
import styled from "@emotion/styled";
import { useNavigate } from "react-router-dom";
import { DeleteIcon } from "../../icons/icons";
import { Icon28CalendarOutline, Icon28ClockOutline, Icon28PlaceOutline } from "@vkontakte/icons";
import { eventStore } from "../../stores/EventStore";
const Container = styled.div`
  background-color: #ebf2fa;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: transparent;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: #000;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #2d81e0;
  display: flex;
  align-items: center;
`;

const Content = styled.div`
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const NotificationCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 12px;
  margin: 12px 0px;
  display: flex;
  gap: 12px;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const EventImage = styled.img`
  width: 80px;
  height: 80px;
  border-radius: 8px;
  object-fit: cover;
`;

const InfoSection = styled.div`
  flex-grow: 1;
`;

const EventTitle = styled.div`
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 8px;
`;

// const DetailRow = styled.div`
//   display: flex;
//   align-items: center;
//   gap: 4px;
//   color: #818c99;
//   font-size: 13px;
//   margin-bottom: 4px;
// `;
const DetailRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  color: #818c99;
  font-size: 13px;
  margin-bottom: 2px;

  svg {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
`;

const TagsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;
const AcceptButton = styled.button`
  background-color: #2d81e0;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-weight: 500;
  font-size: 14px;
  flex-grow: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    opacity 0.2s ease;

  &:disabled {
    background-color: #d0d6dd;
    cursor: default;
    opacity: 0.8;
  }
`;

const DeleteButton = styled.button`
  background-color: #f2f3f5;
  border: none;
  border-radius: 8px;
  width: 40px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;

interface Notification {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  image: string;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const handleDelete = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleAccept = (notification: Notification) => {
    setAccepted((prev) => new Set([...prev, notification.id]));
    eventStore.addAcceptedEvent({
      id: notification.id,
      title: notification.title,
      date: notification.date,
      time: notification.time,
      location: notification.location,
      image: notification.image,
    });
  };

  return (
    <Container>
      <Header>
        <Title>Мои уведомления</Title>
        <CloseButton onClick={() => navigate(-1)}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </CloseButton>
      </Header>

      <Content>
        {notifications.length > 0 ? (
          notifications.map((notification) => (
            <NotificationCard key={notification.id}>
              <EventImage src={notification.image} alt={notification.title} />
              <InfoSection>
                <EventTitle>{notification.title}</EventTitle>
                <TagsContainer>
                  <DetailRow>
                    <Icon28CalendarOutline
                      width={16}
                      height={16}
                      fill="var(--vkui--color_icon_secondary)"
                    />
                    {notification.date}
                    <Icon28ClockOutline
                      style={{ marginLeft: "8px" }}
                      width={16}
                      height={16}
                      fill="var(--vkui--color_icon_secondary)"
                    />
                    {notification.time}
                  </DetailRow>

                  <DetailRow>
                    <Icon28PlaceOutline
                      width={16}
                      height={16}
                      fill="var(--vkui--color_icon_secondary)"
                    />
                    {notification.location}
                  </DetailRow>
                </TagsContainer>

                <Actions>
                  <AcceptButton
                    disabled={accepted.has(notification.id)}
                    onClick={() => handleAccept(notification)}
                  >
                    {accepted.has(notification.id) ? "Вы записаны" : "Принять приглашение"}
                  </AcceptButton>
                  <DeleteButton onClick={() => handleDelete(notification.id)}>
                    <DeleteIcon />
                  </DeleteButton>
                </Actions>
              </InfoSection>
            </NotificationCard>
          ))
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#818c99",
            }}
          >
            Пока нет уведомлений. Здесь появятся приглашения на поводы.
          </div>
        )}
      </Content>
    </Container>
  );
}
