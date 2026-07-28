import type { Comment, User } from "./types.js";

export function presentPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    city: user.city,
    interests: user.interests ?? [],
  };
}

export function presentComment(comment: Comment) {
  return {
    ...comment,
    author: presentPublicUser(comment.author),
  };
}
