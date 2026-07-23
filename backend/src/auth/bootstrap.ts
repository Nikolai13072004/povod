import { config } from "../config";
import { getRepository } from "../store";
import { hashPassword } from "./password";

export async function initAuth(): Promise<void> {
  if (!config.demoAuthEnabled) return;
  const repository = getRepository();
  const demoUser = await repository.getUser("u1");
  if (!demoUser || (await repository.getPasswordHash(demoUser.id))) return;
  await repository.setPasswordHash(demoUser.id, await hashPassword(config.demoAuthPassword));
  console.log("[auth] учётные данные демо-пользователя подготовлены");
}
