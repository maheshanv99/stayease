import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_COLORS = {
  success:  { bg: '#EAF3DE', color: '#27500A' },
  pending:  { bg: '#FAEEDA', color: '#854F0B' },
  failed:   { bg: '#FCEBEB', color: '#791F1F' },
  refunded: { bg: '#F1EFE8', color: '#666' },
}

export default function PaymentsManager({ propertyId, isSuperAdmin = false }) {
  const [payments, setPayments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('all')
  const [refunding, setRefunding] = useState(null)
  const [refundReason, setRefundReason] = useState('')
  const [msg, setMsg]             = useState('')

  useEffect(() => { loadPayments() }, [propertyId, filter])

  async function loadPayments() {
    setLoading(true)
    let query = supabase
      .from('payments')
      .select('*, tenants(full_name, phone), invoices(billing_month)')
      .order('paid_at', { ascending: false })

    if (propertyId) query = query.eq('property_id', propertyId)
    if (filter !== 'all') query = query.eq('status', filter)

    const { data } = await query
    setPayments(data || [])
    setLoading(false)
  }

  function showMsg(text) { setMsg(text); setTimeout(() => setMsg(''), 4000) }

  async function handleRefund(payment) {
    if (!payment.razorpay_payment_id) {
      // Cash payment — just mark as refunded in DB
      if (!confirm(`Mark this cash payment of ₹${payment.amount.toLocaleString('en-IN')} as refunded?`)) return
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', payment.id)
      await supabase.from('invoices').update({ status: 'pending', paid_at: null }).eq('id', payment.invoice_id)
      showMsg('✓ Cash payment marked as refunded')
      loadPayments()
      return
    }

    setRefunding(payment)
    setRefundReason('')
  }

  async function confirmRefund() {
    if (!refunding) return
    const { data, error } = await supabase.functions.invoke('process-refund', {
      body: {
        paymentId:         refunding.id,
        razorpayPaymentId: refunding.razorpay_payment_id,
        amount:            refunding.amount,
        reason:            refundReason || 'Refund by admin',
      }
    })

    if (error || data?.error) {
      showMsg(`❌ ${error?.message || data?.error}`)
    } else {
      showMsg(`✓ Refund of ₹${refunding.amount.toLocaleString('en-IN')} processed successfully`)
      loadPayments()
    }
    setRefunding(null)
  }

  const totalCollected = payments.filter(p => p.status === 'success').reduce((s, p) => s + p.amount, 0)
  const totalRefunded  = payments.filter(p => p.status === 'refunded').reduce((s, p) => s + p.amount, 0)
  const tabs = ['all', 'success', 'refunded', 'failed']

  return (
    <div>
      <h3 style={styles.title}>Payments</h3>

      {/* Summary */}
      <div style={styles.summaryRow}>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Total collected</p>
          <p style={{ ...styles.summaryVal, color: '#27500A' }}>₹{totalCollected.toLocaleString('en-IN')}</p>
        </div>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Total refunded</p>
          <p style={{ ...styles.summaryVal, color: '#791F1F' }}>₹{totalRefunded.toLocaleString('en-IN')}</p>
        </div>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Net collected</p>
          <p style={styles.summaryVal}>₹{(totalCollected - totalRefunded).toLocaleString('en-IN')}</p>
        </div>
      </div>

      {msg && <div style={styles.msgBar}>{msg}</div>}

      {/* Filter tabs */}
      <div style={styles.tabs}>
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ ...styles.tab, ...(filter === t ? styles.tabActive : {}) }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: '#666', fontSize: 14 }}>Loading...</p> :
        payments.length === 0 ? <p style={{ color: '#666', fontSize: 14 }}>No payments found.</p> : (
        <div style={styles.list}>
          {payments.map(p => {
            const sc = STATUS_COLORS[p.status] || STATUS_COLORS.pending
            return (
              <div key={p.id} style={styles.row}>
                <div style={{ flex: 1 }}>
                  <p style={styles.name}>{p.tenants?.full_name}</p>
                  <p style={styles.sub}>
                    {p.invoices?.billing_month ? new Date(p.invoices.billing_month).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) : '—'}
                    {' · '}{p.payment_mode?.toUpperCase()}
                    {p.razorpay_payment_id ? ` · ${p.razorpay_payment_id}` : ' · Cash'}
                  </p>
                  <p style={styles.sub}>{new Date(p.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span style={{ ...styles.badge, background: sc.bg, color: sc.color }}>{p.status}</span>
                <span style={styles.amount}>₹{p.amount.toLocaleString('en-IN')}</span>
                {p.status === 'success' && (isSuperAdmin || true) && (
                  <button onClick={() => handleRefund(p)} style={styles.refundBtn}>↩ Refund</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Refund confirmation modal */}
      {refunding && (
        <div style={styles.overlay} onClick={() => setRefunding(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Process refund</h3>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
              Refunding <strong>₹{refunding.amount.toLocaleString('en-IN')}</strong> to <strong>{refunding.tenants?.full_name}</strong>
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>Reason (optional)</label>
              <input style={styles.input} placeholder="e.g. Tenant vacated early"
                value={refundReason} onChange={e => setRefundReason(e.target.value)} />
            </div>
            <div style={styles.warningBox}>
              ⚠️ This will refund ₹{refunding.amount.toLocaleString('en-IN')} to the tenant's original payment method and mark the invoice as pending.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setRefunding(null)} style={styles.secondaryBtn}>Cancel</button>
              <button onClick={confirmRefund} style={{ ...styles.primaryBtn, background: '#D85A30' }}>
                Confirm refund ₹{refunding.amount.toLocaleString('en-IN')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  title: { fontSize: 16, fontWeight: 600, margin: '0 0 14px' },
  summaryRow: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  summaryCard: { background: 'white', borderRadius: 10, padding: '12px 16px', flex: 1, minWidth: 120 },
  summaryLabel: { fontSize: 12, color: '#666', margin: '0 0 4px' },
  summaryVal: { fontSize: 18, fontWeight: 600, margin: 0 },
  msgBar: { background: '#E1F5EE', color: '#0F6E56', fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 8, marginBottom: 12 },
  tabs: { display: 'flex', gap: 6, marginBottom: 14 },
  tab: { padding: '6px 14px', fontSize: 13, borderRadius: 20, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  tabActive: { background: '#1D9E75', color: 'white', border: '1px solid #1D9E75', fontWeight: 500 },
  list: { background: 'white', borderRadius: 10, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' },
  name: { margin: 0, fontSize: 14, fontWeight: 500 },
  sub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500 },
  amount: { fontSize: 15, fontWeight: 600 },
  refundBtn: { padding: '6px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #ddd', background: 'white', color: '#854F0B', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 400 },
  label: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  input: { padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
  warningBox: { background: '#FAEEDA', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#854F0B' },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', flex: 1 },
}
