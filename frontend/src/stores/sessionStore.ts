import { makeAutoObservable, runInAction } from "mobx";
import bridge from "@vkontakte/vk-bridge";
import { CURRENT_USER } from "../currentUser";
import {
  authAPI,
  getSessionToken,
  setSessionToken,
  usersAPI,
  type AuthSession,
  type ProfileUpdate,
  type User,
} from "../services/api";
import { eventStore } from "./EventStore";
import { filtersStore } from "./filtersStore";
import { notificationsStore } from "./notificationsStore";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error("Platform response timeout")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

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

    const launchParams = window.location.search.replace(/^\?/, "");
    const hasVkLaunch = /(?:^|&)vk_user_id=/.test(launchParams);

    try {
      if (!hasVkLaunch) return;

      const info = (await withTimeout(bridge.send("VKWebAppGetUserInfo"), 3000)) as {
        id: number;
        first_name?: string;
        last_name?: string;
        photo_200?: string;
        photo_100?: string;
        city?: { title?: string };
      };
      const name = [info.first_name, info.last_name].filter(Boolean).join(" ");
      const avatar = info.photo_200 || info.photo_100;
      runInAction(() => {
        this.isVK = true;
        this.city = info.city?.title || "";
      });

      const response = await authAPI.vk(launchParams, { name, avatar });
      if (response.data) this.applySession(response.data);
      else {
        runInAction(() => {
          this.error = response.error ?? "Не удалось подтвердить вход через VK";
        });
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

  register = async (name: string, email: string, password: string): Promise<boolean> => {
    return this.authenticate(() => authAPI.register({ name, email, password }));
  };

  /** Сохранение профиля на сервере (FE-009): раньше интересы и город жили только локально. */
  updateProfile = async (patch: ProfileUpdate): Promise<boolean> => {
    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });
    const response = await usersAPI.updateMe(patch);
    if (response.data) {
      runInAction(() => {
        this.user = response.data!;
        if (response.data!.city !== undefined) this.city = response.data!.city;
        this.isLoading = false;
      });
      return true;
    }
    runInAction(() => {
      this.error = response.error ?? "Не удалось сохранить профиль";
      this.isLoading = false;
    });
    return false;
  };

  logout = async (): Promise<void> => {
    if (getSessionToken()) await authAPI.logout();
    setSessionToken();
    eventStore.resetSessionState();
    filtersStore.resetAll(); // фильтры не должны переезжать к следующему пользователю
    notificationsStore.reset(); // как и чужие уведомления со счётчиком на колокольчике
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
