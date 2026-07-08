export interface CommentReply {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
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
}
