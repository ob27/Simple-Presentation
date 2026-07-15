// Emoji -> array of uids who reacted with it. A map of arrays (not a
// literal nested array), matching this codebase's established Firestore
// "no nested arrays" convention (same shape as pathHoles/tableCells).
export type CommentReactions = Record<string, string[]>;

export interface CommentReply {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
  reactions?: CommentReactions;
}

export interface DiagramComment {
  id: string;
  pageId: string;
  x: number;
  y: number;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
  resolved: boolean;
  replies: CommentReply[];
  reactions?: CommentReactions;
}
