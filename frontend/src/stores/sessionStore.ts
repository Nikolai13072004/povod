import { makeAutoObservable, runInAction } from "mobx";
import bridge from "@vkontakte/vk-bridge";
import { CURRENT_USER } from "../currentUser";
import { authAPI, type User } from "../services/api";

/**
 * Сессия текущего пользователя.
 *
 * Главное правило: ВНУТРИ ВК имя/аватар берём напрямую из VK Bridge
 * (VKWebAppGetUserInfo) — это надёжно работает в среде ВК и не зависит от
 * бэкенд-проверки подписи. Бэкенд-авторизация (проверка sign + upsert)
 * выполняется вторым шагом ради server-side identity; если она по какой-то
 * причине не прошла — на отображение это не влияет.
 *
 * Вне ВК (обычный браузер) GetUserInfo отклоняется → остаёмся на мок-пользователе.
 */
class SessionStore {
  user: User = CURRENT_USER;
  city = "";
  isVK = false;
  initialized = false;

  constructor() {
    makeAutoObservable(this);
  }

  init = async (): Promise<void> => {
    if (this.initialized) return;
    this.initialized = true;

    // 1) Профиль из VK Bridge. Успех = мы внутри ВКонтакте.
    let info: Awaited<ReturnType<typeof bridge.send>> | null = null;
    try {
      info = await bridge.send("VKWebAppGetUserInfo");
    } catch {
      // Не внутри ВК — используем мок-пользователя.
      return;
    }

    const vkInfo = info as {
      id: number;
      first_name?: string;
      last_name?: string;
      photo_200?: string;
      photo_100?: string;
      city?: { title?: string };
    };
    const name = [vkInfo.first_name, vkInfo.last_name].filter(Boolean).join(" ");
    const avatar = vkInfo.photo_200 || vkInfo.photo_100;

    // Сразу показываем реального пользователя (имя/аватар из ВК)
    runInAction(() => {
      this.user = {
        id: `vk_${vkInfo.id}`,
        name: name || this.user.name,
        email: this.user.email,
        avatar: avatar || this.user.avatar,
      };
      this.city = vkInfo.city?.title || "";
      this.isVK = true;
    });

    // 2) Бэкенд-авторизация: проверка подписи launch-параметров + upsert.
    //    Делается ради server-side identity; на отображение не влияет.
    const launchParams = window.location.search.replace(/^\?/, "");
    if (/(?:^|&)vk_user_id=/.test(launchParams)) {
      try {
        const res = await authAPI.vk(launchParams, { name, avatar });
        if (res.data) {
          runInAction(() => {
            this.user = res.data as User;
          });
        }
      } catch {
        /* бэкенд-проверка не прошла — остаёмся на профиле из VK Bridge */
      }
    }
  };
}

export const sessionStore = new SessionStore();
