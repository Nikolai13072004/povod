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
  align-items: center;
  justify-content: space-around;
  width: 100%;
  height: 60px;
  padding: 0 10px 20px 10px;
  background: #ffffff;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
  border-top: 2px solid #e8efff;
`;

const StyledNavLink = styled(NavLink, { shouldForwardProp })`
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  background: transparent;
  text-decoration: none;
  transition: color 0.2s ease;

  color: #6b7a99;

  &.active {
    color: #2688eb;
  }

  &:hover {
    color: #2688eb;
  }
`;

export default function NavMenu() {
  return (
    <NavWrapper>
      <Nav>
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
      </Nav>
    </NavWrapper>
  );
}
