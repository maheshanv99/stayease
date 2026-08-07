import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ChangePassword({ onClose }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm]         = useState('')
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPassword !== confirm) { setMsg('❌ Passwords do not match'); return }
    if (newPassword.length < 6)  { setMsg('❌ Password must be at least 6 characters'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setMsg(`❌ ${error.message}`)
    else {
      setMsg('✓ Password updated successfully!')
      setTimeout(() => onClose?.(), 1500)
    }
    setSaving(false)
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Change password</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={styles.label}>New password</label>
            <input style={styles.input} type="password" placeholder="Min 6 characters"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
          </div>
          <div>
            <label style={styles.label}>Confirm password</label>
            <input style={styles.input} type="password" placeholder="Repeat password"
              value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} />
          </div>
          {msg && <p style={{ fontSize: 13, color: msg.startsWith('✓') ? '#1D9E75' : '#D85A30', margin: 0, fontWeight: 500 }}>{msg}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={styles.secondaryBtn}>Cancel</button>
            <button type="submit" style={styles.primaryBtn} disabled={saving}>
              {saving ? 'Saving...' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 360 },
  label: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  input: { padding: '10px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', flex: 1 },
}
