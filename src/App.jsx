import { useEffect } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import OwnerDashboard from './pages/OwnerDashboard'
import TenantDashboard from './pages/TenantDashboard'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import { supabase } from './lib/supabase'

function AppContent() {
  const { session, profile, loading, isInvite } = useAuth()

  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      supabase.auth.getSession()
    }
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#666', fontFamily: 'system-ui' }}>Loading...</p>
    </div>
  )

  // Show set-password form for invite/recovery links
  if (isInvite) return <LoginPage forceSetPassword />

  if (!session || !profile) return <LoginPage />
  if (profile.is_super_admin || profile.role === 'super_admin') return <SuperAdminDashboard />
  if (profile.role === 'owner') {
    if (profile.subscription_status === 'inactive') return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 40 }}>🔒</span>
        <h3 style={{ margin: 0 }}>Account deactivated</h3>
        <p style={{ color: '#666', textAlign: 'center', maxWidth: 300 }}>
          Your StayEase subscription has been deactivated. Please contact support to reactivate.
        </p>
        <button onClick={() => supabase.auth.signOut()}
          style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    )
    return <OwnerDashboard />
  }
  if (profile.role === 'tenant') return <TenantDashboard />

  return <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
