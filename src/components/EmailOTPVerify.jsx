import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function EmailOTPVerify({ email, onVerified, onCancel }) {
  const [otp, setOtp]           = useState('')
  const [sending, setSending]   = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState('')

  async function sendOTP() {
    setSending(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    })
    if (error) {
      // If user doesn't exist, still send OTP
      const { error: e2 } = await supabase.auth.signInWithOtp({ email })
      if (e2) { setError(`❌ Failed to send OTP: ${e2.message}`); setSending(false); return }
    }
    setSent(true); setSending(false)
  }

  async function verifyOTP() {
    if (otp.length !== 6) { setError('Enter 6-digit OTP'); return }
    setVerifying(true); setError('')
    const { error } = await supabase.auth.verifyOtp({
      email, token: otp, type: 'email'
    })
    if (error) { setError(`❌ Invalid OTP: ${error.message}`); setVerifying(false); return }
    setVerifying(false)
    onVerified()
  }

  return (
    <div style={styles.container}>
      <p style={styles.title}>📧 Verify email address</p>
      <p style={styles.emailText}>{email}</p>

      {!sent ? (
        <>
          <p style={styles.desc}>Click below to send a 6-digit OTP to this email address.</p>
          <button onClick={sendOTP} disabled={sending} style={styles.primaryBtn}>
            {sending ? 'Sending OTP...' : 'Send OTP'}
          </button>
        </>
      ) : (
        <>
          <p style={styles.desc}>OTP sent! Check inbox and enter the 6-digit code below.</p>
          <input style={styles.otpInput} type="number" placeholder="Enter 6-digit OTP"
            value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setSent(false); setOtp('') }} style={styles.secondaryBtn}>Resend</button>
            <button onClick={verifyOTP} disabled={verifying} style={styles.primaryBtn}>
              {verifying ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}
      <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
    </div>
  )
}

const styles = {
  container: { background: '#E6F1FB', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  title: { margin: 0, fontSize: 13, fontWeight: 600, color: '#185FA5' },
  emailText: { margin: 0, fontSize: 13, color: '#333', fontWeight: 500 },
  desc: { margin: 0, fontSize: 12, color: '#666' },
  otpInput: { padding: '10px 12px', fontSize: 18, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', letterSpacing: 4, textAlign: 'center' },
  primaryBtn: { padding: '9px 18px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#185FA5', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '9px 18px', fontSize: 13, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  cancelBtn: { border: 'none', background: 'none', color: '#999', fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: 0 },
  error: { margin: 0, fontSize: 12, color: '#D85A30', fontWeight: 500 },
}
