// Every toggleable toolbar button shares one mutual-exclusion group — picking
// any one of these exits whatever else was active (drawing mode or panel
// alike) and shows its own settings in the single right-side panel slot.
// True one-shot instant actions (Undo, Redo, Container, Export, Help) are
// NOT part of this set — they stay independent onClick handlers.
export type ToolId =
  | 'select'
  | 'directSelect'
  | 'shapes'
  | 'text'
  | 'pen'
  | 'brush'
  | 'stylePaint'
  | 'hotspot'
  | 'media'
  | 'connect'
  | 'comment'
  | 'highlight'
  | 'layers'
  | 'animation'
  | 'data'
  | 'validation'
  | 'pageSettings'
  | 'gridRulers'
  | 'tags'
  | 'shapeGallery';
