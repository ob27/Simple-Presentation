export interface ShapeLink {
  type: 'page' | 'shape' | 'url';
  targetPageId?: string;
  targetNodeId?: string;
  url?: string;
  highlightOnArrive?: boolean;
  // 'smartAnimate' (default) is today's existing smooth camera pan, kept as
  // the default so current behavior is unchanged unless a link explicitly
  // opts into something else.
  transition?: 'instant' | 'dissolve' | 'smartAnimate';
}
