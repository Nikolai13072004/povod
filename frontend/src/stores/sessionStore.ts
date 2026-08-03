import { makeAutoObservable, runInAction } from "mobx";
import bridge from "@vkontakte/vk-bridge";
import { CURRENT_USER } from "../currentUser";
import {
  authAPI,
  clearLocalSession,
  hasReadableCsrfCookie,
  hasStoredSession,
  setSessionToken,
  setCsrfToken,
  usersAPI,
  type AuthSession,
  type ProfileUpdate,
  type User,
} from "../services/api";
import { eventStore } from "./EventStore";
import { filtersStore } from "./filtersStore";
import { notificationsStore } from "./notificationsStore";
import { favoritesStore } from "./favoritesStore";
import { chatStore } from "./chatStore";
import { eventChatStore } from "./eventChatStore";
import { friendsStore } from "./friendsStore";

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

    if (hasStoredSession()) {
      const current = await authAPI.session();
      if (current.data) {
        runInAction(() => {
          this.user = current.data!.user;
          this.authenticated = true;
          this.initialized = true;
          this.isLoading = false;
        });
        // Отметки нужны сразу: сердечки в ленте иначе покажут пустое состояние
        // на уже отмеченных событиях (PROD-001).
        void favoritesStore.load();
        return;
      }
      /*
       * Локальную сессию чистим, только когда сервер её действительно отверг.
       *
       * Раньше здесь стоял безусловный `clearLocalSession()`, а `fetchApi`
       * возвращает `status: 0` на любое исключение fetch — офлайн, таймаут,
       * сбой CORS, холодный старт бесплатного сервиса (~50 секунд). В этих
       * случаях серверная HttpOnly-кука жива, а мы стирали CSRF-куку и
       * оказывались в рассогласованном состоянии: чтение сервер по-прежнему
       * аутентифицирует, а любая запись упирается в 403 «CSRF token missing».
       * В интерфейсе при этом человека выкидывало на экран входа, хотя сессия
       * действительна ещё неделю.
       */
      if (current.status === 401 || current.status === 403) {
        clearLocalSession();
      } else {
        runInAction(() => {
          this.initialized = true;
          this.isLoading = false;
          this.error = "Не удалось проверить сессию. Проверьте соединение";
        });
        return;
      }
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
    if (hasStoredSession()) await authAPI.logout();
    clearLocalSession();
    this.resetSessionScopedStores();
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

  /**
   * Забывает всё, что принадлежало прошлому пользователю.
   *
   * Одна функция на все три случая — выход, истечение сессии и вход другого
   * человека — потому что расходятся они молча. Так и вышло: `logout` чистил
   * пять сторов, а `handleUnauthorized` — только события, и после истечения
   * сессии на общем устройстве переписка, уведомления и избранное оставались в
   * памяти вкладки. Следующий вошедший видел их до первой загрузки своих.
   */
  private resetSessionScopedStores(): void {
    eventStore.resetSessionState();
    filtersStore.resetAll();
    notificationsStore.reset();
    favoritesStore.reset();
    chatStore.reset();
    eventChatStore.reset();
    friendsStore.reset();
  }

  private applySession(session: AuthSession): void {
    if (this.authenticated && this.user.id !== session.user.id) {
      this.resetSessionScopedStores();
    }
    /*
     * Сначала сохраняем CSRF-токен из ответа: на кросс-доменном развёртывании
     * кука API невидима скриптам фронта, и без этого значения заголовок двойной
     * отправки взять неоткуда — любой изменяющий запрос упирался бы в 403.
     * Порядок важен: `hasCookieSession()` ниже смотрит и на него тоже.
     */
    setCsrfToken(session.csrfToken);
    /*
     * Резервный Bearer нужен там, где кука API не видна скриптам: это и
     * VK Mini App в iframe (браузер режет сторонние куки), и развёртывание с
     * фронтом на отдельном домене. Признак один — читается ли CSRF-кука
     * напрямую. Если читается, фронт и API на одном сайте, куки работают
     * привычно, и токен в браузере не храним вовсе (SEC-001).
     */
    setSessionToken(hasReadableCsrfCookie() ? undefined : session.token);
    runInAction(() => {
      this.user = session.user;
      this.authenticated = true;
      this.error = null;
    });
    void favoritesStore.load();
  }

  private handleUnauthorized = (): void => {
    this.resetSessionScopedStores();
    runInAction(() => {
      this.authenticated = false;
      this.error = "Сессия истекла. Войдите снова.";
    });
  };
}

export const sessionStore = new SessionStore();
