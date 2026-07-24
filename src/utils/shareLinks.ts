import { message } from 'antd';

// Shared by Dashboard.tsx's gallery card AND DocumentEditor.tsx's in-editor
// Share button — previously this was Dashboard-only, so sharing a document
// required navigating back out of it first.
export function copyInviteLink(inviteToken: string): void {
  const url = `${window.location.origin}/simple-presentation/invite/${inviteToken}`;
  navigator.clipboard.writeText(url);
  message.success('Invite link copied');
}
