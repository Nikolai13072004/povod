import { NavLink } from "react-router-dom";
import styled from "@emotion/styled";
import "../index.css";
import { HomeIcon, AddIcon, EventIcon, ChatIcon } from "../icons/icons";

const shouldForwardProp = (prop: string) => prop !== "$mode";

const NavWrapper = styled("div", { shouldForwardProp })`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  z-index: 100;
  display: flex;
  justify-content: center;
  background: transparent;
`;

const Nav = styled("nav", { shouldForwardProp })`
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: var(--povod-content-max, 1080px);
  margin: 0 auto;
  height: 60px;
  padding: 0 10px 20px 10px;
  background: var(--povod-surface);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
  border-top: 2px solid var(--povod-border-strong);
`;

const NavInner = styled("div", { shouldForwardProp })`
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  max-width: 480px;
`;

const StyledNavLink = styled(NavLink, { shouldForwardProp })`
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  background: transparent;
  text-decoration: none;
  transition: color 0.2s ease;

  color: var(--povod-text-secondary);

  &.active {
    color: var(--povod-primary);
  }

  &:hover {
    color: var(--povod-primary);
  }
`;

export default function NavMenu() {
  return (
    <NavWrapper>
      <Nav>
        <NavInner>
          <StyledNavLink to="/page-1">
            <HomeIcon />
          </StyledNavLink>
          <StyledNavLink to="/add">
            <AddIcon />
          </StyledNavLink>
          <StyledNavLink to="/events">
            <EventIcon />
          </StyledNavLink>
          <StyledNavLink to="/chats">
            <ChatIcon />
          </StyledNavLink>
        </NavInner>
      </Nav>
    </NavWrapper>
  );
}
