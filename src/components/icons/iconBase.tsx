import type { CSSProperties } from 'react';

export interface IconProps {
  style?: CSSProperties;
  className?: string;
}

// Every custom icon shares this exact sizing/stroke convention so it's a
// pure drop-in replacement for an antd icon wherever one is used (1em
// square, inherits currentColor + the surrounding font-size) — no changes
// needed anywhere else in ToolButton/Tooltip/Button wrapper code.
export const ICON_STROKE = 1.6;
export const ICON_VIEWBOX = '0 0 24 24';
