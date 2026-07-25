import { message } from 'antd';

// Shared by Dashboard.tsx's gallery card AND DocumentEditor.tsx's in-editor
// Share button — previously this was Dashboard-only, so sharing a document
// required navigating back out of it first. `kind` only changes the toast
// text — the invite doc itself (resolved by InvitePage via
// resolveDiagramInvite) is what actually carries the role, keyed off which
// token was copied.
export function copyInviteLink(inviteToken: string, kind: 'edit' | 'viewer' = 'edit'): void {
  const url = `${window.location.origin}/simple-presentation/invite/${inviteToken}`;
  navigator.clipboard.writeText(url);
  message.success(kind === 'viewer' ? 'Viewer invite link copied' : 'Editor invite link copied');
}
