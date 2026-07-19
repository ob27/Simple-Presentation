import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer, List, Avatar, Tag, Button, Typography, Empty, Badge, Popconfirm } from 'antd';
import {
  BellOutlined, CheckCircleOutlined, WarningOutlined, InfoCircleOutlined,
  ExclamationCircleOutlined, CloseOutlined, DeleteOutlined,
} from '@ant-design/icons';
import {
  subscribeUserNotifications, markNotificationRead, markAllNotificationsRead,
  deleteNotification, clearAllNotifications, notificationMillis, type PlatformNotification,
} from '../utils/notifications';

const { Text } = Typography;

// Platform-wide standard: this same bell (trigger + Drawer, product filter
// chips, type-colored icons, delete/clear-all, time-ago) is hand-mirrored
// into every Simple-* app's own header, immediately before the avatar — see
// /Users/tom/oestler/client/src/sections/NotificationDrawer.jsx, the
// original richer pattern this was standardized on, and Simple-Checklists'
// own src/components/NotificationBell.tsx (the first sibling-app copy).
// Uses plain @ant-design/icons (not this app's own hand-drawn navIcons.tsx
// set) so the bell itself looks identical across every Simple-* product.
const PRODUCT_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'simple-checklists', label: 'Checklists' },
  { key: 'simple-kanban', label: 'Kanban' },
  { key: 'simple-presentation', label: 'Presentation' },
  { key: 'simple-asset-management', label: 'Assets' },
  { key: 'simple-doc-control', label: 'Doc Control' },
];

const TYPE_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  warning: { color: '#faad14', icon: <WarningOutlined /> },
  success: { color: '#52c41a', icon: <CheckCircleOutlined /> },
  info: { color: '#1677ff', icon: <InfoCircleOutlined /> },
  error: { color: '#ff4d4f', icon: <ExclamationCircleOutlined /> },
};

function typeStyle(type: string) {
  return TYPE_STYLE[type] ?? { color: '#1677ff', icon: <InfoCircleOutlined /> };
}

function timeAgo(ms: number): string {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Date(ms).toLocaleDateString();
}

// A notification's `link` may point within THIS app (a react-router path)
// or into a different Simple-* product's own separately-deployed SPA —
// only the latter needs a full page navigation rather than client routing.
function goToLink(link: string, navigate: (path: string) => void) {
  if (link.startsWith('/simple-') && !link.startsWith('/simple-presentation')) window.location.href = link;
  else navigate(link);
}

interface Props {
  uid: string;
}

export function NotificationBell({ uid }: Props) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => subscribeUserNotifications(uid, setNotifications), [uid]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.sourceApp === filter);

  function handleSelect(n: PlatformNotification) {
    if (!n.read) markNotificationRead(n.id);
    if (n.link) { setOpen(false); goToLink(n.link, navigate); }
  }

  return (
    <>
      <span style={{ display: 'inline-flex', cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <Badge count={unreadCount} size="small">
          <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} shape="circle" />
        </Badge>
      </span>
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              Notifications
              {unreadCount > 0 && <Tag color="red" style={{ marginLeft: 8, borderRadius: 10, fontSize: 11 }}>{unreadCount} new</Tag>}
            </span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {unreadCount > 0 && (
                <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }} onClick={() => markAllNotificationsRead(notifications)}>
                  Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Popconfirm
                  title="Clear all notifications?" description="This cannot be undone."
                  okText="Clear all" okButtonProps={{ danger: true }} cancelText="Cancel"
                  onConfirm={() => clearAllNotifications(notifications)} placement="bottomRight"
                >
                  <Button type="link" size="small" danger style={{ padding: 0, fontSize: 12 }}>Clear all</Button>
                </Popconfirm>
              )}
            </div>
          </div>
        }
        placement="right" onClose={() => setOpen(false)} open={open} width={400}
        closeIcon={<CloseOutlined style={{ fontSize: 14 }} />}
        styles={{ header: { borderBottom: '1px solid #f0f0f0', padding: '16px 20px' }, body: { padding: 0 } }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid #f0f0f0' }}>
          {PRODUCT_FILTERS.map(f => (
            <Tag.CheckableTag key={f.key} checked={filter === f.key} onChange={() => setFilter(f.key)}>
              {f.label}
            </Tag.CheckableTag>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 48 }}><Empty description="No notifications" /></div>
        ) : (
          <List
            dataSource={filtered}
            renderItem={n => {
              const style = typeStyle(n.type);
              return (
                <List.Item
                  style={{ padding: '14px 20px', background: n.read ? '#fff' : '#f6f9ff', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                  onClick={() => handleSelect(n)}
                >
                  <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'flex-start' }}>
                    <Avatar size={36} style={{ background: `${style.color}18`, color: style.color, flexShrink: 0, fontSize: 16 }} icon={style.icon} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <Text strong style={{ fontSize: 13, lineHeight: 1.3 }}>{n.title}</Text>
                        {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1677ff', display: 'inline-block', flexShrink: 0 }} />}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.4, display: 'block' }}>
                        {n.body || n.message || n.description}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block', opacity: 0.6 }}>
                        {timeAgo(notificationMillis(n.createdAt))}
                      </Text>
                    </div>
                    <Button
                      type="text" size="small" icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                      onClick={e => { e.stopPropagation(); deleteNotification(n.id); }}
                      style={{ color: '#8c8c8c', flexShrink: 0 }}
                      aria-label="Delete notification"
                    />
                  </div>
                </List.Item>
              );
            }}
          />
        )}
      </Drawer>
    </>
  );
}
