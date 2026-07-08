import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './pages/Dashboard';
import { DocumentEditor } from './pages/DocumentEditor';
import { PresentationView } from './pages/PresentationView';
import { InvitePage } from './pages/InvitePage';
import { FolderInvitePage } from './pages/FolderInvitePage';

// Sub-apps no longer show their own login form — Firebase Auth's session is
// shared across every product on oestler.com (same origin, same project;
// confirmed live: signing in on the root immediately authenticates every
// sub-app with no extra step). An unauthenticated visit here now redirects
// to the platform's one central login, which sends the user right back via
// ?returnTo once signed in.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#EEF0F5' }}>
      <Spin size="large" />
    </div>
  );
  if (!user) {
    // In production this app is always reachable at oestler.com/simple-presentation,
    // so the root's /login always exists to redirect to. In local dev this
    // app usually runs standalone on its own port with no root app alongside
    // it — falling back to the local LoginScreen (with its own dev-only
    // anonymous sign-in button) keeps that workflow intact.
    if (import.meta.env.PROD) {
      window.location.href = `/login?returnTo=${encodeURIComponent(window.location.href)}`;
      return null;
    }
    return <LoginScreen />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter basename="/simple-presentation">
      <Routes>
        <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/d/:id" element={<AuthGuard><DocumentEditor /></AuthGuard>} />
        <Route path="/d/:id/present" element={<AuthGuard><PresentationView /></AuthGuard>} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/folder-invite/:token" element={<FolderInvitePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
