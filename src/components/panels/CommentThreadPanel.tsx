import { useMemo, useState } from 'react';
import { Mentions, Button, Popconfirm } from 'antd';
import { IconSend, IconPencil, IconDelete, IconCheck, IconClose, IconExit, IconAdd } from '../icons';
import type { DiagramComment, CommentReply, CommentReactions } from '../../types/comments';
import { CommentAvatar } from '../canvas/CommentAvatar';
import { EmojiPicker } from '../EmojiPicker';
import { useUserProfiles, resolveDisplay } from '../../utils/userProfiles';

interface DraftComment {
  pageId: string;
  x: number;
  y: number;
}

interface Member {
  uid: string;
  email: string;
}

interface Props {
  comment: DiagramComment | null;
  draft: DraftComment | null;
  currentUserId: string;
  currentUserSeed: string;
  members?: Member[];
  onPost: (text: string) => void;
  onReply: (text: string) => void;
  onEditComment: (text: string) => void;
  onEditReply: (replyId: string, text: string) => void;
  onDeleteReply: (replyId: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onToggleResolved: () => void;
  onDeleteThread: () => void;
  onClose: () => void;
}

// @mentions are stored as plain "@email" substrings inside the existing
// comment/reply `text` field — no schema change. This just finds them again
// at render time to highlight them; matches emails greedily up to whitespace.
const MENTION_RE = /@[^\s@]+@[^\s@]+\.[^\s@]+|@[^\s@]+/g;

function renderTextWithMentions(text: string) {
  const parts = text.split(MENTION_RE);
  const matches = text.match(MENTION_RE) ?? [];
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(part);
    if (matches[i]) nodes.push(<span key={i} style={{ color: '#1677ff', fontWeight: 600 }}>{matches[i]}</span>);
  });
  return nodes;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Styled to match Simple AIM Kanban's CardNotesModal comment thread exactly
// (same avatar treatment, bubble background/radius, timestamp format, hover
// edit/delete affordances) so comments feel like the same product across
// both apps — mounted as a right-side drawer (matching ShapePropertiesPanel)
// rather than Kanban's modal, since that's this app's own convention for
// "click an object, see its detail panel on the right."
export function CommentThreadPanel({
  comment, draft, currentUserId, currentUserSeed, members = [],
  onPost, onReply, onEditComment, onEditReply, onDeleteReply, onToggleReaction, onToggleResolved, onDeleteThread, onClose,
}: Props) {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null); // 'root' or a reply id
  const [editingText, setEditingText] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const mentionOptions = useMemo(
    () => members.map(m => ({ value: m.email, label: m.email })),
    [members],
  );

  const authorUids = [
    ...(comment ? [comment.authorId] : []),
    ...(comment?.replies.map(r => r.authorId) ?? []),
    currentUserId,
  ];
  const profiles = useUserProfiles(authorUids);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (draft) onPost(trimmed);
    else onReply(trimmed);
    setText('');
  }

  function startEdit(id: string, currentText: string) {
    setEditingId(id);
    setEditingText(currentText);
  }

  function confirmEdit() {
    const trimmed = editingText.trim();
    if (trimmed) {
      if (editingId === 'root') onEditComment(trimmed);
      else if (editingId) onEditReply(editingId, trimmed);
    }
    setEditingId(null);
  }

  function renderBubble(opts: {
    id: string; authorId: string; authorName: string; text: string; createdAt: number;
    reactions?: CommentReactions; canDelete: boolean; onDelete?: () => void;
  }) {
    const canEdit = opts.authorId === currentUserId;
    const isEditing = editingId === opts.id;
    const isHovered = hoveredId === opts.id;
    // Fallback seed stays `authorId` (not authorName/email) to preserve the
    // exact avatar every existing comment already shows before anyone has
    // set up a profile — only nickname/avatarSeed/avatarPhotoURL (once a
    // user actually sets them) should ever change how a comment looks.
    const p = profiles[opts.authorId];
    const display = {
      name: p?.nickname || opts.authorName,
      avatarSeed: p?.avatarSeed || opts.authorId,
      avatarPhotoURL: p?.avatarPhotoURL,
    };
    return (
      <div
        key={opts.id}
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
        onMouseEnter={() => setHoveredId(opts.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        <CommentAvatar seed={display.avatarSeed} photoURL={display.avatarPhotoURL} size={28} />
        <div style={{ flex: 1, background: '#f8f9fb', borderRadius: 8, padding: '8px 12px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>{display.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#bbb' }}>{relativeTime(opts.createdAt)}</span>
              {(canEdit || opts.canDelete) && isHovered && !isEditing && (
                <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                  {canEdit && (
                    <button
                      onClick={() => startEdit(opts.id, opts.text)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#bbb', borderRadius: 3 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#555')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#bbb')}
                    >
                      <IconPencil style={{ fontSize: 11 }} />
                    </button>
                  )}
                  {opts.canDelete && opts.onDelete && (
                    <Popconfirm title="Delete this comment?" onConfirm={opts.onDelete} okText="Delete" okButtonProps={{ danger: true }} placement="topRight">
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#bbb', borderRadius: 3 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ff4d4f')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#bbb')}
                      >
                        <IconDelete style={{ fontSize: 11 }} />
                      </button>
                    </Popconfirm>
                  )}
                </div>
              )}
            </div>
          </div>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Mentions
                value={editingText}
                onChange={v => setEditingText(v)}
                options={mentionOptions}
                prefix="@"
                autoSize={{ minRows: 2 }}
                autoFocus
                style={{ fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Button size="small" icon={<IconClose />} onClick={() => setEditingId(null)}>Cancel</Button>
                <Button size="small" type="primary" icon={<IconCheck />} onClick={confirmEdit}>Save</Button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderTextWithMentions(opts.text)}</div>
          )}
          {!isEditing && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, alignItems: 'center' }}>
              {Object.entries(opts.reactions ?? {}).filter(([, uids]) => uids.length > 0).map(([emoji, uids]) => {
                const mine = uids.includes(currentUserId);
                return (
                  <button
                    key={emoji}
                    onClick={() => onToggleReaction(opts.id, emoji)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, padding: '1px 6px', borderRadius: 10,
                      border: mine ? '1px solid #1677ff' : '1px solid #e6e8ef', background: mine ? '#EEF4FF' : '#fff', cursor: 'pointer',
                    }}
                  >
                    <span>{emoji}</span>
                    <span style={{ color: '#888', fontSize: 11 }}>{uids.length}</span>
                  </button>
                );
              })}
              <EmojiPicker onSelect={emoji => onToggleReaction(opts.id, emoji)}>
                <button
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
                    background: 'none', border: '1px solid #e6e8ef', borderRadius: 10, cursor: 'pointer', color: '#999',
                  }}
                >
                  <IconAdd style={{ fontSize: 10 }} />
                </button>
              </EmojiPicker>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, zIndex: 15,
      background: '#fff', borderLeft: '1px solid #e6e8ef', boxShadow: '-2px 0 8px rgba(0,0,0,0.05)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>{draft ? 'New comment' : 'Comment'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {comment && (
            <>
              <Button
                size="small" type={comment.resolved ? 'default' : 'text'}
                icon={<IconCheck />}
                style={comment.resolved ? { color: '#2e9e5b', borderColor: '#2e9e5b' } : undefined}
                onClick={onToggleResolved}
              >
                {comment.resolved ? 'Resolved' : 'Resolve'}
              </Button>
              {comment.authorId === currentUserId && (
                <Popconfirm title="Delete this thread?" onConfirm={onDeleteThread} okText="Delete" okButtonProps={{ danger: true }} placement="bottomRight">
                  <Button size="small" type="text" icon={<IconDelete />} />
                </Popconfirm>
              )}
            </>
          )}
          <Button size="small" type="text" icon={<IconExit />} onClick={onClose} />
        </div>
      </div>

      <div style={{ padding: 14, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {comment && renderBubble({
          id: 'root', authorId: comment.authorId, authorName: comment.authorName, text: comment.text, createdAt: comment.createdAt,
          reactions: comment.reactions, canDelete: false,
        })}
        {comment?.replies.map((r: CommentReply) => renderBubble({
          id: r.id, authorId: r.authorId, authorName: r.authorName, text: r.text, createdAt: r.createdAt,
          reactions: r.reactions, canDelete: r.authorId === currentUserId, onDelete: () => onDeleteReply(r.id),
        }))}
      </div>

      <div style={{ padding: 14, borderTop: comment ? '1px solid #f0f0f0' : undefined, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <CommentAvatar
          seed={resolveDisplay(currentUserId, currentUserSeed, profiles).avatarSeed}
          photoURL={resolveDisplay(currentUserId, currentUserSeed, profiles).avatarPhotoURL}
          size={28}
        />
        <div style={{ flex: 1, display: 'flex', gap: 8 }}>
          <Mentions
            value={text}
            onChange={v => setText(v)}
            onPressEnter={handleSend}
            options={mentionOptions}
            prefix="@"
            placeholder={draft ? 'Write a comment… (@ to mention)' : 'Reply… (@ to mention)'}
            style={{ flex: 1, fontSize: 13 }}
            autoFocus
          />
          <EmojiPicker onSelect={emoji => setText(t => `${t}${emoji}`)}>
            <Button>🙂</Button>
          </EmojiPicker>
          <Button type="primary" icon={<IconSend />} onClick={handleSend} disabled={!text.trim()} />
        </div>
      </div>
    </div>
  );
}
