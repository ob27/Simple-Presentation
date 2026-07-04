import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Button, Alert } from 'antd';
import { useAuth } from '../AuthContext';
import { LoginScreen } from '../components/LoginScreen';
import { resolveDiagramInvite, joinDiagram, type DiagramInviteInfo } from '../store';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<DiagramInviteInfo | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token) return;
    resolveDiagramInvite(token).then(info => {
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
    return <LoginScreen redirectAfterLogin={`/invite/${token}`} />;
  }

  async function handleJoin() {
    if (!invite) return;
    setJoining(true);
    try {
      await joinDiagram(invite.diagramId, user!.uid, user!.email ?? undefined);
      navigate(`/d/${invite.diagramId}`);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5', gap: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 48px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📐</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
          Join "{invite?.diagramName}"
        </div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
          You've been invited to collaborate on this diagram.
        </div>
        <Button type="primary" size="large" loading={joining} onClick={handleJoin} block>
          Join diagram
        </Button>
      </div>
    </div>
  );
}
