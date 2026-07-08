// A preset id from FRAME_PRESETS (src/utils/paperSizes.ts), e.g. 'a4', 'iphone-15', 'custom'.
// Kept as a plain string (not a closed union) so new presets can be added without a migration.
export type PaperSize = string;
export type Orientation = 'portrait' | 'landscape';

export interface DiagramPage {
  id: string;
  name: string;
  order: number;
  paperSize: PaperSize;
  orientation: Orientation;
  customWidth?: number;
  customHeight?: number;
  backgroundColor?: string;
}

export interface PresentationSettings {
  // 'auto' picks a device bezel/monitor/slide treatment per page based on
  // its paper-size category (see utils/presentationFrame.ts); 'none' always
  // presents full-bleed regardless of page size or aspect ratio.
  frameMode: 'auto' | 'none';
  roundedCorners: boolean;
  frameColor: string;
}

export interface DiagramDocument {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail?: string;
  coOwnerIds?: string[];
  memberIds: string[];
  memberEmails?: Record<string, string>;
  viewerIds?: string[];
  inviteToken: string;
  publicShareToken?: string | null;
  publicShareRole?: 'viewer' | 'commenter';
  pageOrder: string[];
  createdAt: number;
  updatedAt: number;
  presentationSettings?: PresentationSettings;
  isTemplate?: boolean;
  templateCategory?: string;
  templateDescription?: string;
  templateIsBuiltIn?: boolean;
}

export type FolderRole = 'owner' | 'editor' | 'viewer';

// Mirrors Simple AIM Kanban's Folder type exactly (substituting diagramIds
// for kanbanIds) for UX/sharing-model consistency across the two sibling
// apps — see src/store.ts's folder functions for the full port.
export interface DiagramFolder {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail?: string;
  memberIds: string[];
  editorIds: string[];
  memberEmails: Record<string, string>;
  diagramIds: string[];
  inviteToken: string;
  editorInviteToken?: string;
  createdAt: number;
  folderLogoUrl?: string | null;
}

export interface DiagramFolderInviteInfo {
  folderId: string;
  folderName: string;
  ownerEmail: string;
  diagramIds: string[];
  role: FolderRole;
}
