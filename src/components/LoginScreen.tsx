import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, Spin, Alert } from 'antd';
import { useAuth } from '../AuthContext';

interface Props {
  redirectAfterLogin?: string;
}

export function LoginScreen({ redirectAfterLogin }: Props) {
  const { signIn, resetPassword, signInAnonymously } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [resetSent, setResetSent] = useState(false);

  async function handleSignIn({ email, password }: { email: string; password: string }) {
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      if (redirectAfterLogin) navigate(redirectAfterLogin);
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset({ email }: { email: string }) {
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch {
      setError('Could not send reset email. Check the address and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '48px 56px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', gap: 24, minWidth: 340 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', letterSpacing: '-0.5px' }}>
            Simple Diagram
          </div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2, fontWeight: 500 }}>by Oestler</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
            {mode === 'signin' ? 'Sign in to access your diagrams' : 'Reset your password'}
          </div>
        </div>

        {error && <Alert message={error} type="error" showIcon />}

        {mode === 'signin' ? (
          <Form layout="vertical" onFinish={handleSignIn} requiredMark={false}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
              <Input size="large" autoComplete="email" autoFocus />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]} style={{ marginBottom: 8 }}>
              <Input.Password size="large" autoComplete="current-password" />
            </Form.Item>
            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <Button type="link" size="small" onClick={() => { setMode('reset'); setError(''); }} style={{ padding: 0, fontSize: 12, color: '#888' }}>
                Forgot password?
              </Button>
            </div>
            <Button type="primary" htmlType="submit" size="large" loading={loading} block style={{ fontWeight: 600 }}>
              Sign in
            </Button>
            {import.meta.env.DEV && (
              <Button type="dashed" block style={{ marginTop: 8 }} onClick={() => signInAnonymously()}>
                Dev: sign in anonymously
              </Button>
            )}
          </Form>
        ) : resetSent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <div style={{ fontSize: 14, color: '#333', marginBottom: 8, fontWeight: 600 }}>Check your email</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>We've sent a password reset link. Check your inbox (and spam folder).</div>
            <Button onClick={() => { setMode('signin'); setResetSent(false); setError(''); }} block>
              Back to sign in
            </Button>
          </div>
        ) : (
          <Form layout="vertical" onFinish={handleReset} requiredMark={false}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
              <Input size="large" autoComplete="email" autoFocus />
            </Form.Item>
            <div style={{ marginBottom: 20 }}>
              <Button type="link" size="small" onClick={() => { setMode('signin'); setError(''); }} style={{ padding: 0, fontSize: 12, color: '#888' }}>
                Back to sign in
              </Button>
            </div>
            <Button type="primary" htmlType="submit" size="large" loading={loading} block style={{ fontWeight: 600 }}>
              Send reset email
            </Button>
          </Form>
        )}
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5' }}>
      <Spin size="large" />
    </div>
  );
}
