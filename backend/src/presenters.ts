import type { Comment, User } from "./types";

export function presentPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    interests: user.interests ?? [],
  };
}

export function presentComment(comment: Comment) {
  return {
    ...comment,
    author: presentPublicUser(comment.author),
  };
}
