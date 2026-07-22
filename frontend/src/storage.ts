/**
 * Локальное хранение выбранных интересов пользователя (по его id).
 * Это реальные данные пользователя (его выбор), которые переживают перезапуск
 * приложения. Привязка к id, чтобы у разных пользователей на одном устройстве
 * интересы не смешивались.
 */
export function getStoredInterests(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`interests:${userId}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setStoredInterests(userId: string, list: string[]): void {
  try {
    localStorage.setItem(`interests:${userId}`, JSON.stringify(list));
  } catch {
    /* localStorage недоступен — игнорируем */
  }
}
