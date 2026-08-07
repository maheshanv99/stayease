import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RentCollection({ propertyId }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')

  useEffect(() => { if (propertyId) loadInvoices() }, [propertyId, filter])

  async function loadInvoices() {
    setLoading(true)
    let query = supabase
      .from('invoices')
      .select('*, tenants(full_name, phone)')
      .eq('property_id', propertyId)
      .order('due_date', { ascending: true })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data } = await query
    setInvoices(data || [])
    setLoading(false)
  }

  async function markCashPaid(invoiceId) {
    if (!confirm('Mark this invoice as paid by cash?')) return
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId)
    await supabase.from('payments').insert({
      invoice_id: invoiceId,
      tenant_id: invoices.find(i => i.id === invoiceId)?.tenant_id,
      property_id: propertyId,
      amount: invoices.find(i => i.id === invoiceId)?.total_amount,
      payment_mode: 'cash',
      status: 'success',
      paid_at: new Date().toISOString(),
    })
    loadInvoices()
  }

  const statusColors = {
    pending: { bg: '#FAEEDA', color: '#854F0B' },
    paid: { bg: '#EAF3DE', color: '#27500A' },
    overdue: { bg: '#FCEBEB', color: '#791F1F' },
  }

  const tabs = ['pending', 'overdue', 'paid', 'all']

  return (
    <div>
      <h3 style={styles.title}>Rent collection</h3>
      <div style={styles.tabs}>
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ ...styles.tab, ...(filter === t ? styles.tabActive : {}) }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: '#666', fontSize: 14 }}>Loading...</p> :
        invoices.length === 0 ? <p style={{ color: '#666', fontSize: 14 }}>No {filter} invoices found. Generate invoices first.</p> : (
        <div style={styles.list}>
          {invoices.map(inv => {
            const sc = statusColors[inv.status] || statusColors.pending
            return (
              <div key={inv.id} style={styles.row}>
                <div style={{ flex: 1 }}>
                  <p style={styles.name}>{inv.tenants?.full_name}</p>
                  <p style={styles.sub}>{new Date(inv.billing_month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} · {inv.tenants?.phone}</p>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>₹{inv.total_amount.toLocaleString('en-IN')}</span>
                <span style={{ ...styles.badge, background: sc.bg, color: sc.color }}>{inv.status}</span>
                {inv.status !== 'paid' && (
                  <button onClick={() => markCashPaid(inv.id)} style={styles.cashBtn}>✓ Cash paid</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  title: { fontSize: 16, fontWeight: 600, margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 6, marginBottom: 14 },
  tab: { padding: '6px 14px', fontSize: 13, borderRadius: 20, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  tabActive: { background: '#1D9E75', color: 'white', border: '1px solid #1D9E75', fontWeight: 500 },
  list: { background: 'white', borderRadius: 10, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' },
  name: { margin: 0, fontSize: 14, fontWeight: 500 },
  sub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  badge: { fontSize: 11, padding: '3px 8px', borderRadius: 99, fontWeight: 500, textTransform: 'capitalize' },
  cashBtn: { padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #1D9E75', background: '#E1F5EE', color: '#0F6E56', cursor: 'pointer', fontWeight: 500 },
}
