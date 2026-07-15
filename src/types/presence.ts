export interface DragPreview {
  shapeIds: string[];
  dx: number;
  dy: number;
}

export interface PresenceRecord {
  uid: string;
  displayName: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selectedShapeIds: string[];
  dragPreview: DragPreview | null;
  lastActive: number;
  mode: 'edit' | 'present';
}
