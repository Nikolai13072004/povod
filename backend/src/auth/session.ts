import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "../config";
import { getRepository } from "../store";
import type { User } from "../types";

export interface IssuedSession {
  token: string;
  expiresAt: string;
  user: User;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueSession(user: User): Promise<IssuedSession> {
  const repository = getRepository();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.authSessionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  await repository.createSession({
    id: randomUUID(),
    tokenHash: hashSessionToken(token),
    userId: user.id,
    createdAt: now.toISOString(),
    expiresAt,
    lastUsedAt: now.toISOString(),
  });
  return { token, expiresAt, user };
}

export async function resolveSession(
  token: string,
): Promise<{ id: string; user: User } | undefined> {
  if (!token) return undefined;
  const repository = getRepository();
  const session = await repository.getSessionByTokenHash(hashSessionToken(token));
  if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
    return undefined;
  }
  const user = await repository.getUser(session.userId);
  if (!user) return undefined;
  await repository.touchSession(session.id, new Date().toISOString());
  return { id: session.id, user };
}
