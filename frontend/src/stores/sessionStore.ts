import { makeAutoObservable, runInAction } from "mobx";
import bridge from "@vkontakte/vk-bridge";
import { CURRENT_USER } from "../currentUser";
import {
  authAPI,
  getSessionToken,
  setSessionToken,
  type AuthSession,
  type User,
} from "../services/api";
import { eventStore } from "./EventStore";

class SessionStore {
  user: User = CURRENT_USER;
  city = "";
  isVK = false;
  initialized = false;
  isLoading = false;
  authenticated = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
    window.addEventListener("povod:unauthorized", this.handleUnauthorized);
  }

  init = async (): Promise<void> => {
    if (this.initialized || this.isLoading) return;
    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });

    if (getSessionToken()) {
      const current = await authAPI.session();
      if (current.data) {
        runInAction(() => {
          this.user = current.data!.user;
          this.authenticated = true;
          this.initialized = true;
          this.isLoading = false;
        });
        return;
      }
      setSessionToken();
    }

    try {
      const info = (await bridge.send("VKWebAppGetUserInfo")) as {
        id: number;
        first_name?: string;
        last_name?: string;
        photo_200?: string;
        photo_100?: string;
        city?: { title?: string };
      };
      const name = [info.first_name, info.last_name].filter(Boolean).join(" ");
      const avatar = info.photo_200 || info.photo_100;
      const launchParams = window.location.search.replace(/^\?/, "");

      runInAction(() => {
        this.isVK = true;
        this.city = info.city?.title || "";
      });

      if (/(?:^|&)vk_user_id=/.test(launchParams)) {
        const response = await authAPI.vk(launchParams, { name, avatar });
        if (response.data) this.applySession(response.data);
        else {
          runInAction(() => {
            this.error = response.error ?? "Не удалось подтвердить вход через VK";
          });
        }
      }
    } catch {
      // Обычный браузер: пользователь войдёт через форму POVOD.
    } finally {
      runInAction(() => {
        this.initialized = true;
        this.isLoading = false;
      });
    }
  };

  login = async (email: string, password: string): Promise<boolean> => {
    return this.authenticate(() => authAPI.login({ email, password }));
  };

  register = async (
    name: string,
    email: string,
    password: string,
  ): Promise<boolean> => {
    return this.authenticate(() => authAPI.register({ name, email, password }));
  };

  logout = async (): Promise<void> => {
    if (getSessionToken()) await authAPI.logout();
    setSessionToken();
    eventStore.resetSessionState();
    runInAction(() => {
      this.user = CURRENT_USER;
      this.authenticated = false;
      this.error = null;
    });
  };

  private authenticate = async (
    request: () => ReturnType<typeof authAPI.login>,
  ): Promise<boolean> => {
    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });
    const response = await request();
    if (response.data) {
      this.applySession(response.data);
      runInAction(() => {
        this.isLoading = false;
      });
      return true;
    }
    runInAction(() => {
      this.error = response.error ?? "Не удалось войти";
      this.isLoading = false;
    });
    return false;
  };

  private applySession(session: AuthSession): void {
    if (this.authenticated && this.user.id !== session.user.id) {
      eventStore.resetSessionState();
    }
    setSessionToken(session.token);
    runInAction(() => {
      this.user = session.user;
      this.authenticated = true;
      this.error = null;
    });
  }

  private handleUnauthorized = (): void => {
    eventStore.resetSessionState();
    runInAction(() => {
      this.authenticated = false;
      this.error = "Сессия истекла. Войдите снова.";
    });
  };
}

export const sessionStore = new SessionStore();
