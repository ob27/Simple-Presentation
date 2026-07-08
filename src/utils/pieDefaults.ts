import type { PieSegment } from '../types/shapes';

// A freshly placed pie chart has no user data yet — an evenly-split 3-wedge
// placeholder means it never renders blank before the properties panel's
// segment editor has been touched.
export const DEFAULT_PIE_SEGMENTS: PieSegment[] = [
  { id: 'a', label: 'A', value: 1, color: '#7C93E8' },
  { id: 'b', label: 'B', value: 1, color: '#8CD9A8' },
  { id: 'c', label: 'C', value: 1, color: '#FFD97A' },
];
