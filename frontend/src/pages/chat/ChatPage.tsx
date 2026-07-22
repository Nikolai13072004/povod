import { AppRoot, SplitLayout, SplitCol, Panel, Group, Search } from "@vkontakte/vkui";
import styled from "@emotion/styled";
import "@vkontakte/vkui/dist/vkui.css";

const WhitePanel = styled(Panel)`
  .vkuiGroup {
    background-color: inherit;
  }
`;

const ChatContainer = styled.div`
  background-color: #ffffff;
  min-height: 100vh;
`;

const EmptyWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 80px 24px;
  text-align: center;
`;

const EmptyEmoji = styled.div`
  font-size: 56px;
  line-height: 1;
`;

const EmptyTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: #000000;
`;

const EmptyText = styled.div`
  font-size: 14px;
  color: #818c99;
  max-width: 280px;
  line-height: 1.4;
`;

export const ChatList = () => {
  return (
    <AppRoot>
      <SplitLayout>
        <SplitCol>
          <WhitePanel id="main">
            <ChatContainer>
              <Group mode="plain">
                <Search placeholder="Поиск" />
                <EmptyWrap>
                  <EmptyEmoji>💬</EmptyEmoji>
                  <EmptyTitle>Чатов пока нет</EmptyTitle>
                  <EmptyText>
                    Здесь появятся переписки с участниками твоих поводов. Функция скоро будет
                    доступна.
                  </EmptyText>
                </EmptyWrap>
              </Group>
            </ChatContainer>
          </WhitePanel>
        </SplitCol>
      </SplitLayout>
    </AppRoot>
  );
};

export default ChatList;
