/**
 * How many comments leave a post when one is deleted: the comment itself and,
 * when it is a comment and not a reply, every reply under it. The server
 * counts the same way (a deleted comment takes its replies out of the list),
 * so the number the post shows drops by this much at once and not by one.
 */
interface Listed {
  id: string;
  replies?: readonly { id: string }[];
}

export function removedWith(comments: readonly Listed[], commentId: string): number {
  const comment = comments.find((c) => c.id === commentId);
  return comment ? 1 + (comment.replies?.length ?? 0) : 1;
}
