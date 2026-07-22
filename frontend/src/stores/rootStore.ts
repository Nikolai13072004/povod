import { makeAutoObservable, runInAction } from "mobx";
import { healthAPI } from "../services/api";

interface BackendStatus {
  service?: string;
  status: string;
  database_enabled?: boolean;
}

class RootStore {
  pingData: { message?: string } | null = null;
  healthData: BackendStatus | null = null;
  error: string | null = null;
  isLoading = false;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Проверяет доступность бэкенда (ping + health).
   * Некритично: при недоступности сервера не показываем пользователю ошибку,
   * только логируем — фронт продолжает работать.
   */
  async loadBackendStatus() {
    runInAction(() => {
      this.isLoading = true;
    });
    try {
      const [ping, health] = await Promise.all([healthAPI.ping(), healthAPI.health()]);
      runInAction(() => {
        this.pingData = ping.data ?? null;
        this.healthData = (health.data as BackendStatus) ?? null;
        this.isLoading = false;
      });
    } catch (err) {
      console.warn("[rootStore] backend недоступен:", err);
      runInAction(() => {
        this.healthData = null;
        this.isLoading = false;
      });
    }
  }
}

export const rootStore = new RootStore();
