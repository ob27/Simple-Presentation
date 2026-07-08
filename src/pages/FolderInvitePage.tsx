import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Button, Alert } from 'antd';
import { useAuth } from '../AuthContext';
import { LoginScreen } from '../components/LoginScreen';
import { resolveFolderInvite, joinFolder } from '../store';
import type { DiagramFolderInviteInfo } from '../types/document';

export function FolderInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<DiagramFolderInviteInfo | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token) return;
    resolveFolderInvite(token).then(info => {
      if (!info) setError('This invite link is invalid or has expired.');
      else setInvite(info);
    });
  }, [token]);

  if (authLoading || (!invite && !error)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5' }}>
        <Alert message={error} type="error" showIcon />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen redirectAfterLogin={`/folder-invite/${token}`} />;
  }

  async function handleJoin() {
    if (!invite) return;
    setJoining(true);
    try {
      await joinFolder(invite.folderId, user!.uid, user!.email ?? undefined, invite.diagramIds, invite.role === 'editor' ? 'editor' : 'viewer');
      navigate('/');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5', gap: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
          Join "{invite?.folderName}"
        </div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
          You've been invited to {invite?.role === 'editor' ? 'edit' : 'view'} this folder and its diagrams.
        </div>
        <Button type="primary" size="large" loading={joining} onClick={handleJoin} block>
          Join folder
        </Button>
      </div>
    </div>
  );
}
