import type { ChartDataPoint } from '../types/shapes';

// A freshly placed chart has no user data yet — a small placeholder series
// means it never renders blank before the properties panel's data editor
// has been touched, same rationale as DEFAULT_PIE_SEGMENTS.
export const DEFAULT_CHART_DATA: ChartDataPoint[] = [
  { id: 'a', label: 'A', value: 3, color: '#7C93E8' },
  { id: 'b', label: 'B', value: 5, color: '#8CD9A8' },
  { id: 'c', label: 'C', value: 2, color: '#FFD97A' },
];
