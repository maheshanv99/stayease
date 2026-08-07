import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function InvoiceManager({ propertyId }) {
  const [invoices, setInvoices] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { if (propertyId) { loadInvoices(); loadTenants() } }, [propertyId])

  async function loadInvoices() {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('*, tenants(full_name, phone)')
      .eq('property_id', propertyId)
      .order('billing_month', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  async function loadTenants() {
    const { data } = await supabase
      .from('tenants')
      .select('*, rooms(base_rent)')
      .eq('property_id', propertyId)
      .eq('status', 'active')
    setTenants(data || [])
  }

  async function generateInvoices() {
    setGenerating(true)
    setMsg('')
    const billingMonth = new Date()
    billingMonth.setDate(1)
    const monthStr = billingMonth.toISOString().slice(0, 10)
    const dueDate = new Date(billingMonth)
    dueDate.setDate(7)

    let created = 0
    for (const t of tenants) {
      const baseRent = t.rooms?.base_rent || 0
      const { error } = await supabase.from('invoices').insert({
        tenant_id: t.id,
        property_id: propertyId,
        billing_month: monthStr,
        base_rent: baseRent,
        food_charges: 0,
        electricity: 0,
        other_charges: 0,
        discount: 0,
        total_amount: baseRent,
        status: 'pending',
        due_date: dueDate.toISOString().slice(0, 10),
      }).select()
      if (!error) created++
    }

    setMsg(`✓ Generated ${created} invoice${created !== 1 ? 's' : ''} for ${new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`)
    setGenerating(false)
    loadInvoices()
  }

  const statusColors = {
    pending: { bg: '#FAEEDA', color: '#854F0B' },
    paid: { bg: '#EAF3DE', color: '#27500A' },
    overdue: { bg: '#FCEBEB', color: '#791F1F' },
    waived: { bg: '#F1EFE8', color: '#666' },
  }

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h3 style={styles.title}>Invoices</h3>
          {msg && <p style={{ fontSize: 13, color: '#1D9E75', margin: '2px 0 0' }}>{msg}</p>}
        </div>
        <button onClick={generateInvoices} disabled={generating || tenants.length === 0} style={styles.primaryBtnSmall}>
          {generating ? 'Generating...' : '+ Generate this month'}
        </button>
      </div>

      {loading ? <p style={{ color: '#666', fontSize: 14 }}>Loading...</p> :
        invoices.length === 0 ? <p style={{ color: '#666', fontSize: 14 }}>No invoices yet. Click "Generate this month" to create invoices for all active tenants.</p> : (
        <div style={styles.list}>
          {invoices.map(inv => {
            const sc = statusColors[inv.status] || statusColors.pending
            return (
              <div key={inv.id} style={styles.row}>
                <div style={{ flex: 1 }}>
                  <p style={styles.name}>{inv.tenants?.full_name}</p>
                  <p style={styles.sub}>{new Date(inv.billing_month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} · Due {new Date(inv.due_date).toLocaleDateString('en-IN')}</p>
                </div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>₹{inv.total_amount.toLocaleString('en-IN')}</span>
                <span style={{ ...styles.badge, background: sc.bg, color: sc.color }}>{inv.status}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  primaryBtnSmall: { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer' },
  list: { background: 'white', borderRadius: 10, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f0f0f0' },
  name: { margin: 0, fontSize: 14, fontWeight: 500 },
  sub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  badge: { fontSize: 11, padding: '3px 8px', borderRadius: 99, fontWeight: 500, textTransform: 'capitalize' },
}
