import { useState } from 'react';
import { Input, Button, Popconfirm } from 'antd';
import { SendOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { DiagramComment, CommentReply } from '../../types/comments';
import { CommentAvatar } from '../canvas/CommentAvatar';

interface DraftComment {
  pageId: string;
  x: number;
  y: number;
}

interface Props {
  comment: DiagramComment | null;
  draft: DraftComment | null;
  currentUserId: string;
  currentUserSeed: string;
  onPost: (text: string) => void;
  onReply: (text: string) => void;
  onEditComment: (text: string) => void;
  onEditReply: (replyId: string, text: string) => void;
  onDeleteReply: (replyId: string) => void;
  onToggleResolved: () => void;
  onDeleteThread: () => void;
  onClose: () => void;
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
  comment, draft, currentUserId, currentUserSeed,
  onPost, onReply, onEditComment, onEditReply, onDeleteReply, onToggleResolved, onDeleteThread, onClose,
}: Props) {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null); // 'root' or a reply id
  const [editingText, setEditingText] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
    canDelete: boolean; onDelete?: () => void;
  }) {
    const canEdit = opts.authorId === currentUserId;
    const isEditing = editingId === opts.id;
    const isHovered = hoveredId === opts.id;
    return (
      <div
        key={opts.id}
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
        onMouseEnter={() => setHoveredId(opts.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        <CommentAvatar seed={opts.authorId} size={28} />
        <div style={{ flex: 1, background: '#f8f9fb', borderRadius: 8, padding: '8px 12px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>{opts.authorName}</span>
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
                      <EditOutlined style={{ fontSize: 11 }} />
                    </button>
                  )}
                  {opts.canDelete && opts.onDelete && (
                    <Popconfirm title="Delete this comment?" onConfirm={opts.onDelete} okText="Delete" okButtonProps={{ danger: true }} placement="topRight">
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#bbb', borderRadius: 3 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ff4d4f')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#bbb')}
                      >
                        <DeleteOutlined style={{ fontSize: 11 }} />
                      </button>
                    </Popconfirm>
                  )}
                </div>
              )}
            </div>
          </div>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Input.TextArea value={editingText} onChange={e => setEditingText(e.target.value)} autoSize={{ minRows: 2 }} autoFocus style={{ fontSize: 13 }} />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingId(null)}>Cancel</Button>
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={confirmEdit}>Save</Button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{opts.text}</div>
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
                icon={<CheckOutlined />}
                style={comment.resolved ? { color: '#2e9e5b', borderColor: '#2e9e5b' } : undefined}
                onClick={onToggleResolved}
              >
                {comment.resolved ? 'Resolved' : 'Resolve'}
              </Button>
              {comment.authorId === currentUserId && (
                <Popconfirm title="Delete this thread?" onConfirm={onDeleteThread} okText="Delete" okButtonProps={{ danger: true }} placement="bottomRight">
                  <Button size="small" type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </>
          )}
          <Button size="small" type="text" icon={<CloseCircleOutlined />} onClick={onClose} />
        </div>
      </div>

      <div style={{ padding: 14, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {comment && renderBubble({
          id: 'root', authorId: comment.authorId, authorName: comment.authorName, text: comment.text, createdAt: comment.createdAt,
          canDelete: false,
        })}
        {comment?.replies.map((r: CommentReply) => renderBubble({
          id: r.id, authorId: r.authorId, authorName: r.authorName, text: r.text, createdAt: r.createdAt,
          canDelete: r.authorId === currentUserId, onDelete: () => onDeleteReply(r.id),
        }))}
      </div>

      <div style={{ padding: 14, borderTop: comment ? '1px solid #f0f0f0' : undefined, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <CommentAvatar seed={currentUserSeed} size={28} />
        <div style={{ flex: 1, display: 'flex', gap: 8 }}>
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onPressEnter={handleSend}
            placeholder={draft ? 'Write a comment…' : 'Reply…'}
            style={{ flex: 1, fontSize: 13 }}
            autoFocus
          />
          <Button type="primary" icon={<SendOutlined />} onClick={handleSend} disabled={!text.trim()} />
        </div>
      </div>
    </div>
  );
}
