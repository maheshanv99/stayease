import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function LoginPage({ forceSetPassword = false }) {
  const { signIn } = useAuth()
  const [mode, setMode] = useState(forceSetPassword ? 'set-password' : 'login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Detect invite/recovery link
    const hash = window.location.hash
    if (hash.includes('type=invite') || hash.includes('type=recovery')) {
      setMode('set-password')
    }
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setSubmitting(false)
  }

  async function handleSetPassword(e) {
    e.preventDefault()
    setError('')
    if (newPassword !== confirm) { setError('Passwords do not match'); return }
    if (newPassword.length < 6)  { setError('Password must be at least 6 characters'); return }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setError(error.message)
    setSubmitting(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <span style={styles.logoIcon}>🏠</span>
          <h1 style={styles.title}>StayEase</h1>
        </div>

        {mode === 'set-password' ? (
          <>
            <p style={styles.subtitle}>Welcome! Please set your password to continue.</p>
            <form onSubmit={handleSetPassword} style={styles.form}>
              <input style={styles.input} type="password" placeholder="New password (min 6 characters)"
                value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
              <input style={styles.input} type="password" placeholder="Confirm password"
                value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} />
              {error && <p style={styles.error}>{error}</p>}
              <button type="submit" style={styles.submitBtn} disabled={submitting}>
                {submitting ? 'Setting password...' : 'Set password & continue'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p style={styles.subtitle}>Sign in to your account</p>
            <form onSubmit={handleLogin} style={styles.form}>
              <input style={styles.input} type="email" placeholder="Email"
                value={email} onChange={e => setEmail(e.target.value)} required />
              <input style={styles.input} type="password" placeholder="Password"
                value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              {error && <p style={styles.error}>{error}</p>}
              <button type="submit" style={styles.submitBtn} disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
            <p style={styles.hint}>
              New user? Click the invite link sent to your email to set your password first.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1EFE8', fontFamily: 'system-ui, sans-serif' },
  card: { background: 'white', borderRadius: 16, padding: '2.5rem', width: 380, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  logoRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 },
  logoIcon: { fontSize: 28 },
  title: { fontSize: 26, fontWeight: 600, margin: 0, color: '#1D9E75' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: '11px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', outline: 'none', width: '100%', boxSizing: 'border-box' },
  error: { color: '#D85A30', fontSize: 13, margin: 0 },
  submitBtn: { padding: '12px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', marginTop: 4 },
  hint: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 20, lineHeight: 1.5 },
}
