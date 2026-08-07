import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const QUICK_LABELS = ['Electricity', 'Water', 'Laundry', 'Parking', 'Internet', 'Gas', 'Cleaning', 'Misc']

export default function ExtraChargesManager({ propertyId }) {
  const [tenants, setTenants] = useState([])
  const [charges, setCharges] = useState([])
  const [mode, setMode] = useState('bulk') // 'bulk' | 'individual'
  const [selectedTenant, setSelectedTenant] = useState('')
  const [filterTenant, setFilterTenant] = useState('')
  const [billingMonth, setBillingMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: true })

  useEffect(() => { if (propertyId) loadTenants() }, [propertyId])
  useEffect(() => { if (propertyId && billingMonth) loadCharges() }, [propertyId, billingMonth, filterTenant])

  async function loadTenants() {
    const { data } = await supabase
      .from('tenants')
      .select('id, full_name, rooms(room_number)')
      .eq('property_id', propertyId)
      .eq('status', 'active')
      .order('full_name')
    setTenants(data || [])
  }

  async function loadCharges() {
    setLoading(true)
    let query = supabase
      .from('extra_charges')
      .select('*, tenants(full_name, rooms(room_number))')
      .eq('property_id', propertyId)
      .eq('billing_month', billingMonth + '-01')
      .order('created_at', { ascending: false })
    if (filterTenant) query = query.eq('tenant_id', filterTenant)
    const { data } = await query
    setCharges(data || [])
    setLoading(false)
  }

  function showMsg(text, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg({ text: '', ok: true }), 3500)
  }

  async function applyChargeToTenant(tenantId, chargeLabel, chargeAmount, chargeNotes) {
    const monthDate = billingMonth + '-01'
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, total_amount, other_charges')
      .eq('tenant_id', tenantId)
      .eq('billing_month', monthDate)
      .single()

    await supabase.from('extra_charges').insert({
      property_id: propertyId,
      tenant_id: tenantId,
      invoice_id: invoice?.id || null,
      billing_month: monthDate,
      label: chargeLabel,
      amount: parseInt(chargeAmount),
      notes: chargeNotes || null,
    })

    if (invoice) {
      await supabase.from('invoices').update({
        other_charges: (invoice.other_charges || 0) + parseInt(chargeAmount),
        total_amount: invoice.total_amount + parseInt(chargeAmount),
      }).eq('id', invoice.id)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!label || !amount) return
    if (mode === 'individual' && !selectedTenant) return
    setSaving(true)

    if (mode === 'bulk') {
      // apply to all active tenants
      for (const t of tenants) {
        await applyChargeToTenant(t.id, label, amount, notes)
      }
      showMsg(`✓ "${label} ₹${parseInt(amount).toLocaleString('en-IN')}" added for all ${tenants.length} tenants`)
    } else {
      await applyChargeToTenant(selectedTenant, label, amount, notes)
      const tenantName = tenants.find(t => t.id === selectedTenant)?.full_name
      showMsg(`✓ "${label} ₹${parseInt(amount).toLocaleString('en-IN')}" added for ${tenantName}`)
    }

    setLabel('')
    setAmount('')
    setNotes('')
    setSaving(false)
    loadCharges()
  }

  async function handleDelete(charge) {
    if (!confirm(`Delete "${charge.label} ₹${charge.amount}" for ${charge.tenants?.full_name}?`)) return
    await supabase.from('extra_charges').delete().eq('id', charge.id)
    if (charge.invoice_id) {
      const { data: inv } = await supabase.from('invoices').select('id, total_amount, other_charges').eq('id', charge.invoice_id).single()
      if (inv) {
        await supabase.from('invoices').update({
          other_charges: Math.max(0, (inv.other_charges || 0) - charge.amount),
          total_amount: Math.max(0, inv.total_amount - charge.amount),
        }).eq('id', inv.id)
      }
    }
    loadCharges()
  }

  // group by tenant
  const grouped = charges.reduce((acc, c) => {
    const key = c.tenant_id
    if (!acc[key]) acc[key] = { name: c.tenants?.full_name, room: c.tenants?.rooms?.room_number, items: [] }
    acc[key].items.push(c)
    return acc
  }, {})

  const grandTotal = charges.reduce((s, c) => s + c.amount, 0)

  return (
    <div>
      <h3 style={styles.title}>Extra charges</h3>
      <p style={styles.subtitle}>Add common charges for all tenants at once, or individual charges per tenant.</p>

      {/* Month picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <label style={styles.label}>Month</label>
        <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} style={styles.inputSm} />
      </div>

      {/* Mode toggle */}
      <div style={styles.modeToggle}>
        <button
          onClick={() => setMode('bulk')}
          style={{ ...styles.modeBtn, ...(mode === 'bulk' ? styles.modeBtnActive : {}) }}
        >
          🌐 All tenants
          <span style={styles.modeSub}>Same charge for everyone</span>
        </button>
        <button
          onClick={() => setMode('individual')}
          style={{ ...styles.modeBtn, ...(mode === 'individual' ? styles.modeBtnActive : {}) }}
        >
          👤 Individual tenant
          <span style={styles.modeSub}>Specific tenant only</span>
        </button>
      </div>

      {/* Form */}
      <div style={styles.formCard}>
        <div style={styles.formCardHeader}>
          <span style={styles.formCardTitle}>
            {mode === 'bulk'
              ? `Adding charge for all ${tenants.length} tenants`
              : 'Adding charge for one tenant'}
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Tenant picker — only in individual mode */}
          {mode === 'individual' && (
            <div style={{ marginBottom: 10 }}>
              <label style={styles.label}>Tenant *</label>
              <select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)} style={styles.input} required>
                <option value="">Select tenant</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name} — Room {t.rooms?.room_number}</option>
                ))}
              </select>
            </div>
          )}

          {/* Quick labels */}
          <div style={{ marginBottom: 10 }}>
            <label style={styles.label}>Quick labels</label>
            <div style={styles.quickBtns}>
              {QUICK_LABELS.map(q => (
                <button type="button" key={q} onClick={() => setLabel(q)}
                  style={{ ...styles.quickBtn, ...(label === q ? styles.quickBtnActive : {}) }}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={{ flex: 2 }}>
              <label style={styles.label}>Label *</label>
              <input style={styles.input} placeholder="e.g. Water" value={label} onChange={e => setLabel(e.target.value)} required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Amount (₹) *</label>
              <input style={styles.input} type="number" placeholder="e.g. 200" value={amount} onChange={e => setAmount(e.target.value)} required min="1" />
            </div>
            <div style={{ flex: 2 }}>
              <label style={styles.label}>Notes (optional)</label>
              <input style={styles.input} placeholder="e.g. June reading" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Bulk preview */}
          {mode === 'bulk' && label && amount && tenants.length > 0 && (
            <div style={styles.previewBox}>
              <span style={styles.previewIcon}>⚡</span>
              <span style={{ fontSize: 13 }}>
                Will add <strong>{label} ₹{parseInt(amount || 0).toLocaleString('en-IN')}</strong> to{' '}
                <strong>{tenants.length} tenants</strong> — total{' '}
                <strong>₹{(parseInt(amount || 0) * tenants.length).toLocaleString('en-IN')}</strong>
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button type="submit" style={styles.primaryBtn} disabled={saving || tenants.length === 0}>
              {saving ? 'Saving...' : mode === 'bulk' ? `+ Add for all ${tenants.length} tenants` : '+ Add charge'}
            </button>
            {msg.text && (
              <span style={{ fontSize: 13, color: msg.ok ? '#1D9E75' : '#D85A30', fontWeight: 500 }}>{msg.text}</span>
            )}
          </div>
        </form>
      </div>

      {/* Charges list */}
      <div style={styles.listHeader}>
        <h4 style={styles.formTitle}>
          {new Date(billingMonth + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })} — all charges
        </h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={filterTenant} onChange={e => setFilterTenant(e.target.value)} style={{ ...styles.inputSm, fontSize: 12 }}>
            <option value="">All tenants</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          {grandTotal > 0 && (
            <span style={styles.totalBadge}>Total ₹{grandTotal.toLocaleString('en-IN')}</span>
          )}
        </div>
      </div>

      {loading ? <p style={{ color: '#666', fontSize: 14 }}>Loading...</p> :
        charges.length === 0 ? <p style={{ color: '#666', fontSize: 14 }}>No extra charges for this month yet.</p> :
        Object.values(grouped).map((group, i) => (
          <div key={i} style={styles.tenantGroup}>
            <div style={styles.tenantGroupHeader}>
              <span style={styles.tenantGroupName}>{group.name}</span>
              <span style={styles.tenantGroupRoom}>Room {group.room}</span>
              <span style={styles.tenantGroupTotal}>₹{group.items.reduce((s, c) => s + c.amount, 0).toLocaleString('en-IN')}</span>
            </div>
            {group.items.map(c => (
              <div key={c.id} style={styles.chargeRow}>
                <span style={styles.chargeLabelBadge}>{c.label}</span>
                <span style={{ flex: 1, fontSize: 12, color: '#888' }}>{c.notes || '—'}</span>
                <span style={styles.chargeAmount}>₹{c.amount.toLocaleString('en-IN')}</span>
                <button onClick={() => handleDelete(c)} style={styles.deleteBtn} title="Delete">×</button>
              </div>
            ))}
          </div>
        ))
      }
    </div>
  )
}

const styles = {
  title: { fontSize: 16, fontWeight: 600, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#666', margin: '0 0 14px' },
  label: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  input: { padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', width: '100%', boxSizing: 'border-box' },
  inputSm: { padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #ddd', background: 'white' },
  modeToggle: { display: 'flex', gap: 10, marginBottom: 16 },
  modeBtn: {
    flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid #ddd',
    background: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column',
    alignItems: 'flex-start', gap: 3, fontSize: 14, fontWeight: 500,
  },
  modeBtnActive: { borderColor: '#1D9E75', background: '#E1F5EE', color: '#0F6E56' },
  modeSub: { fontSize: 11, color: '#888', fontWeight: 400 },
  formCard: { background: 'white', borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  formCardHeader: { background: '#F8F7F4', padding: '10px 16px', borderBottom: '1px solid #eee' },
  formCardTitle: { fontSize: 13, fontWeight: 500, color: '#444' },
  formRow: { display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', padding: '0 16px' },
  quickBtns: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4, padding: '0 16px' },
  quickBtn: { padding: '5px 12px', fontSize: 12, borderRadius: 20, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  quickBtnActive: { background: '#E1F5EE', borderColor: '#1D9E75', color: '#0F6E56', fontWeight: 500 },
  previewBox: {
    display: 'flex', alignItems: 'center', gap: 8, background: '#FAEEDA',
    borderRadius: 8, padding: '8px 12px', margin: '0 16px 8px', fontSize: 13,
  },
  previewIcon: { fontSize: 16 },
  primaryBtn: {
    padding: '10px 20px', fontSize: 14, fontWeight: 500, borderRadius: 8,
    border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  formTitle: { fontSize: 14, fontWeight: 600, margin: 0 },
  totalBadge: { fontSize: 13, fontWeight: 600, background: '#E1F5EE', color: '#0F6E56', padding: '4px 12px', borderRadius: 20 },
  tenantGroup: { background: 'white', borderRadius: 10, overflow: 'hidden', marginBottom: 10 },
  tenantGroupHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F8F7F4', borderBottom: '1px solid #eee' },
  tenantGroupName: { fontSize: 13, fontWeight: 600, flex: 1 },
  tenantGroupRoom: { fontSize: 12, color: '#999', background: '#eee', padding: '2px 8px', borderRadius: 99 },
  tenantGroupTotal: { fontSize: 13, fontWeight: 600, color: '#1D9E75' },
  chargeRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid #f5f5f5' },
  chargeLabelBadge: { fontSize: 12, padding: '3px 10px', borderRadius: 99, background: '#FAEEDA', color: '#854F0B', fontWeight: 500, flexShrink: 0 },
  chargeAmount: { fontSize: 14, fontWeight: 500, flexShrink: 0 },
  deleteBtn: { border: 'none', background: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 },
}
