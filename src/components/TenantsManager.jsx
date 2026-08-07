import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const HANDOVER_CHECKLIST = [
  { key: 'key_returned',  label: 'Key / access card returned' },
  { key: 'room_clean',    label: 'Room left clean' },
  { key: 'no_damage',     label: 'No damage to furniture / fixtures' },
  { key: 'ac_ok',         label: 'AC / fan working fine' },
  { key: 'mattress_ok',   label: 'Mattress / bedding returned' },
  { key: 'bathroom_ok',   label: 'Bathroom in good condition' },
]

export default function TenantsManager({ propertyId, onTenantsChanged }) {
  const [tenants, setTenants]             = useState([])
  const [rooms, setRooms]                 = useState([])
  const [loading, setLoading]             = useState(true)
  const [showAddTenant, setShowAddTenant] = useState(false)
  const [vacateTenant, setVacateTenant]   = useState(null)
  const [vacateData, setVacateData]       = useState(null)

  // form
  const [fullName, setFullName]           = useState('')
  const [phone, setPhone]                 = useState('')
  const [email, setEmail]                 = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [bedNumber, setBedNumber]         = useState(1)
  const [moveInDate, setMoveInDate]       = useState(() => new Date().toISOString().slice(0, 10))
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceMonths, setAdvanceMonths] = useState(1)
  const [advanceNotes, setAdvanceNotes]   = useState('')
  const [error, setError]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [inviteMsg, setInviteMsg]         = useState({})

  // vacate form
  const [checklist, setChecklist]         = useState({})
  const [damageDeduction, setDamageDeduction] = useState(0)
  const [vacateNotes, setVacateNotes]     = useState('')
  const [moveOutDate, setMoveOutDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [vacateSaving, setVacateSaving]   = useState(false)

  useEffect(() => { if (propertyId) { loadTenants(); loadRooms() } }, [propertyId])

  async function loadTenants() {
    setLoading(true)
    const { data } = await supabase
      .from('tenants')
      .select('*, rooms(room_number, sharing_type, base_rent)')
      .eq('property_id', propertyId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setTenants(data || [])
    setLoading(false)
  }

  async function loadRooms() {
    const { data } = await supabase
      .from('rooms').select('*')
      .eq('property_id', propertyId)
      .order('room_number', { ascending: true })
    setRooms(data || [])
  }

  async function handleAddTenant(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    // 1. Create tenant record
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        property_id:    propertyId,
        room_id:        selectedRoomId,
        bed_number:     bedNumber,
        full_name:      fullName,
        phone,
        email:          email || null,
        move_in_date:   moveInDate,
        advance_amount: parseInt(advanceAmount) || 0,
        advance_months: advanceMonths,
        advance_notes:  advanceNotes || null,
        status:         'active',
      })
      .select()
      .single()

    if (tenantError) { setError(tenantError.message); setSaving(false); return }

    // 2. Send invite email if email provided
    if (email) {
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, role: 'tenant' },
        redirectTo: window.location.origin,
      })
      if (inviteError) {
        setError(`Tenant added but invite failed: ${inviteError.message}`)
      }
    }

    setFullName(''); setPhone(''); setEmail(''); setSelectedRoomId('')
    setBedNumber(1); setAdvanceAmount(''); setAdvanceMonths(1); setAdvanceNotes('')
    setSaving(false)
    setShowAddTenant(false)
    loadTenants()
    if (onTenantsChanged) onTenantsChanged()
  }

  async function sendInvite(tenant) {
    if (!tenant.email) { alert('No email on record for this tenant. Edit their record to add one.'); return }
    setInviteMsg(prev => ({ ...prev, [tenant.id]: 'Sending...' }))

    const { data, error } = await supabase.functions.invoke('invite-tenant', {
      body: {
        email:    tenant.email,
        fullName: tenant.full_name,
        phone:    tenant.phone,
        tenantId: tenant.id,
      }
    })

    if (error || data?.error) {
      setInviteMsg(prev => ({ ...prev, [tenant.id]: `❌ ${error?.message || data?.error}` }))
    } else {
      setInviteMsg(prev => ({ ...prev, [tenant.id]: '✓ Invite sent!' }))
      loadTenants()
    }
    setTimeout(() => setInviteMsg(prev => ({ ...prev, [tenant.id]: '' })), 4000)
  }

  // ── Vacate flow ──
  async function startVacate(tenant) {
    setVacateTenant(tenant)
    setChecklist({})
    setDamageDeduction(0)
    setVacateNotes('')
    setMoveOutDate(new Date().toISOString().slice(0, 10))

    const { data: pendingInvoices } = await supabase
      .from('invoices').select('id, billing_month, total_amount, status')
      .eq('tenant_id', tenant.id).in('status', ['pending', 'overdue'])

    const { data: pendingCharges } = await supabase
      .from('extra_charges').select('id, label, amount, billing_month')
      .eq('tenant_id', tenant.id).is('invoice_id', null)

    const { data: openMaintenance } = await supabase
      .from('maintenance_requests').select('id, title, status, priority')
      .eq('tenant_id', tenant.id).in('status', ['open', 'in_progress'])

    setVacateData({
      pendingInvoices: pendingInvoices || [],
      pendingCharges:  pendingCharges  || [],
      openMaintenance: openMaintenance || [],
    })
  }

  function calcRefund(tenant) {
    const advance         = tenant.advance_amount || 0
    const pendingRent     = (vacateData?.pendingInvoices || []).reduce((s, i) => s + i.total_amount, 0)
    const pendingChargesT = (vacateData?.pendingCharges  || []).reduce((s, c) => s + c.amount, 0)
    return advance - pendingRent - pendingChargesT - (damageDeduction || 0)
  }

  async function confirmVacate() {
    if (!vacateTenant) return
    setVacateSaving(true)
    const refund = calcRefund(vacateTenant)
    await supabase.from('tenants').update({
      status:           'vacated',
      move_out_date:    moveOutDate,
      vacate_checklist: checklist,
      advance_refund:   refund,
      vacate_notes:     vacateNotes || null,
    }).eq('id', vacateTenant.id)
    setVacateSaving(false)
    setVacateTenant(null)
    setVacateData(null)
    loadTenants()
    if (onTenantsChanged) onTenantsChanged()
  }

  const selectedRoom        = rooms.find(r => r.id === selectedRoomId)
  const refund              = vacateTenant ? calcRefund(vacateTenant) : 0
  const pendingRentTotal    = (vacateData?.pendingInvoices || []).reduce((s, i) => s + i.total_amount, 0)
  const pendingChargesTotal = (vacateData?.pendingCharges  || []).reduce((s, c) => s + c.amount, 0)
  const hasIssues           = vacateData && (
    vacateData.pendingInvoices.length > 0 ||
    vacateData.pendingCharges.length  > 0 ||
    vacateData.openMaintenance.length > 0
  )

  return (
    <div>
      <div style={styles.headerRow}>
        <h3 style={styles.sectionTitle}>Tenants</h3>
        <button onClick={() => setShowAddTenant(true)} style={styles.primaryBtnSmall} disabled={rooms.length === 0}>
          + Add tenant
        </button>
      </div>
      {rooms.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>Add a room first before adding tenants.</p>}

      {loading ? <p style={{ color: '#666', fontSize: 14 }}>Loading...</p> :
        tenants.length === 0 ? <p style={{ color: '#666', fontSize: 14 }}>No tenants yet.</p> : (
        <div style={styles.tenantList}>
          {tenants.map(t => (
            <div key={t.id} style={styles.tenantRow}>
              <div style={styles.avatar}>{t.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <p style={styles.tenantName}>{t.full_name}</p>
                <p style={styles.tenantSub}>
                  Room {t.rooms?.room_number} · Bed {t.bed_number} · ₹{t.rooms?.base_rent?.toLocaleString('en-IN')}/mo
                  {t.advance_amount > 0 && <span style={styles.advanceBadge}> · Advance ₹{t.advance_amount.toLocaleString('en-IN')}</span>}
                </p>
                <p style={styles.tenantSub}>{t.phone}{t.email ? ` · ${t.email}` : ' · No email'}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                {/* Invite button */}
                <button onClick={() => sendInvite(t)} style={styles.inviteBtn}
                  title={t.user_id ? 'Already linked — resend invite?' : 'Send invite email'}>
                  {t.user_id ? '✓ Linked' : '📧 Send invite'}
                </button>
                {inviteMsg[t.id] && <span style={styles.inviteMsg}>{inviteMsg[t.id]}</span>}
                <button onClick={() => startVacate(t)} style={styles.vacateBtn}>Vacate</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Tenant Modal ── */}
      {showAddTenant && (
        <div style={styles.overlay} onClick={() => setShowAddTenant(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add a tenant</h3>
            <form onSubmit={handleAddTenant} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={styles.input} placeholder="Full name *" value={fullName} onChange={e => setFullName(e.target.value)} required />
              <input style={styles.input} placeholder="Phone number *" value={phone} onChange={e => setPhone(e.target.value)} required />
              <div>
                <input style={styles.input} type="email" placeholder="Email (for app invite)" value={email} onChange={e => setEmail(e.target.value)} />
                <p style={styles.hint}>If provided, tenant gets an email invite to set their password and access the app.</p>
              </div>

              <label style={styles.label}>Room *</label>
              <select style={styles.input} value={selectedRoomId}
                onChange={e => { setSelectedRoomId(e.target.value); setBedNumber(1) }} required>
                <option value="">Select a room</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.room_number} — {r.sharing_type} — ₹{r.base_rent.toLocaleString('en-IN')}/mo</option>
                ))}
              </select>

              {selectedRoom && (
                <>
                  <label style={styles.label}>Bed number</label>
                  <select style={styles.input} value={bedNumber} onChange={e => setBedNumber(parseInt(e.target.value))}>
                    {Array.from({ length: selectedRoom.total_beds }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>Bed {n}</option>
                    ))}
                  </select>
                </>
              )}

              <label style={styles.label}>Move-in date</label>
              <input style={styles.input} type="date" value={moveInDate} onChange={e => setMoveInDate(e.target.value)} required />

              <div style={styles.advanceSection}>
                <p style={styles.advanceSectionTitle}>💰 Advance deposit</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 2 }}>
                    <label style={styles.label}>Amount (₹)</label>
                    <input style={styles.input} type="number" placeholder="e.g. 12000" min="0"
                      value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>Months</label>
                    <select style={styles.input} value={advanceMonths} onChange={e => setAdvanceMonths(parseInt(e.target.value))}>
                      {[1, 2, 3].map(n => <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                </div>
                <input style={styles.input} placeholder="Notes (optional)" value={advanceNotes} onChange={e => setAdvanceNotes(e.target.value)} />
              </div>

              {error && <p style={{ color: '#D85A30', fontSize: 13, margin: 0 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowAddTenant(false)} style={styles.secondaryBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn} disabled={saving}>
                  {saving ? 'Saving...' : email ? 'Add & send invite' : 'Add tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Vacate Checkout Modal ── */}
      {vacateTenant && vacateData && (
        <div style={styles.overlay}>
          <div style={{ ...styles.modal, width: 500 }}>
            <h3 style={{ marginTop: 0 }}>🚪 Vacate — {vacateTenant.full_name}</h3>
            <p style={{ fontSize: 13, color: '#666', margin: '-8px 0 14px' }}>
              Room {vacateTenant.rooms?.room_number} · Advance ₹{(vacateTenant.advance_amount || 0).toLocaleString('en-IN')}
            </p>

            <div style={styles.checkSection}>
              <p style={styles.checkSectionTitle}>{vacateData.pendingInvoices.length > 0 ? '❌' : '✅'} Pending rent</p>
              {vacateData.pendingInvoices.length === 0 ? <p style={styles.allClearText}>All rent cleared</p> :
                vacateData.pendingInvoices.map(inv => (
                  <div key={inv.id} style={styles.issueRow}>
                    <span style={{ fontSize: 13 }}>{new Date(inv.billing_month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</span>
                    <span style={styles.issueBadge}>₹{inv.total_amount.toLocaleString('en-IN')} {inv.status}</span>
                  </div>
                ))
              }
            </div>

            <div style={styles.checkSection}>
              <p style={styles.checkSectionTitle}>{vacateData.pendingCharges.length > 0 ? '❌' : '✅'} Unsettled extra charges</p>
              {vacateData.pendingCharges.length === 0 ? <p style={styles.allClearText}>No pending charges</p> :
                vacateData.pendingCharges.map(c => (
                  <div key={c.id} style={styles.issueRow}>
                    <span style={{ fontSize: 13 }}>{c.label}</span>
                    <span style={styles.issueBadge}>₹{c.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))
              }
            </div>

            <div style={styles.checkSection}>
              <p style={styles.checkSectionTitle}>{vacateData.openMaintenance.length > 0 ? '⚠️' : '✅'} Open maintenance</p>
              {vacateData.openMaintenance.length === 0 ? <p style={styles.allClearText}>No open requests</p> :
                vacateData.openMaintenance.map(m => (
                  <div key={m.id} style={styles.issueRow}>
                    <span style={{ fontSize: 13 }}>{m.title}</span>
                    <span style={{ ...styles.issueBadge, background: '#FAEEDA', color: '#854F0B' }}>{m.status.replace('_', ' ')}</span>
                  </div>
                ))
              }
            </div>

            <div style={styles.checkSection}>
              <p style={styles.checkSectionTitle}>🏠 Room handover checklist</p>
              {HANDOVER_CHECKLIST.map(item => (
                <div key={item.key} style={styles.checkRow} onClick={() => setChecklist(prev => ({ ...prev, [item.key]: !prev[item.key] }))}>
                  <div style={{ ...styles.checkbox, ...(checklist[item.key] ? styles.checkboxChecked : {}) }}>{checklist[item.key] && '✓'}</div>
                  <span style={{ fontSize: 13 }}>{item.label}</span>
                </div>
              ))}
            </div>

            <div style={styles.checkSection}>
              <p style={styles.checkSectionTitle}>🔨 Damage deduction</p>
              <input style={{ ...styles.input, width: 140 }} type="number" min="0"
                placeholder="₹ amount" value={damageDeduction || ''}
                onChange={e => setDamageDeduction(parseInt(e.target.value) || 0)} />
            </div>

            <div style={{ ...styles.checkSection, background: refund >= 0 ? '#EAF3DE' : '#FCEBEB', borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: refund >= 0 ? '#27500A' : '#791F1F' }}>💰 Refund calculation</p>
              <div style={styles.refundRow}><span>Advance paid</span><span>₹{(vacateTenant.advance_amount || 0).toLocaleString('en-IN')}</span></div>
              {pendingRentTotal > 0 && <div style={styles.refundRow}><span>Pending rent</span><span style={{ color: '#D85A30' }}>− ₹{pendingRentTotal.toLocaleString('en-IN')}</span></div>}
              {pendingChargesTotal > 0 && <div style={styles.refundRow}><span>Pending charges</span><span style={{ color: '#D85A30' }}>− ₹{pendingChargesTotal.toLocaleString('en-IN')}</span></div>}
              {damageDeduction > 0 && <div style={styles.refundRow}><span>Damage</span><span style={{ color: '#D85A30' }}>− ₹{damageDeduction.toLocaleString('en-IN')}</span></div>}
              <div style={{ ...styles.refundRow, fontWeight: 700, fontSize: 16, borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 8, marginTop: 4 }}>
                <span>{refund >= 0 ? 'Refund to tenant' : 'Amount to collect'}</span>
                <span style={{ color: refund >= 0 ? '#27500A' : '#791F1F' }}>₹{Math.abs(refund).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Move-out date</label>
                <input style={styles.input} type="date" value={moveOutDate} onChange={e => setMoveOutDate(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={styles.label}>Notes</label>
              <textarea style={{ ...styles.input, height: 56, resize: 'vertical' }}
                placeholder="Handover notes..." value={vacateNotes} onChange={e => setVacateNotes(e.target.value)} />
            </div>

            {hasIssues && <div style={styles.warningBox}>⚠️ Pending items above — settle them separately.</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => { setVacateTenant(null); setVacateData(null) }} style={styles.secondaryBtn}>Cancel</button>
              <button onClick={confirmVacate} disabled={vacateSaving}
                style={{ ...styles.primaryBtn, background: '#D85A30', flex: 2 }}>
                {vacateSaving ? 'Processing...' : `Confirm vacate · ${refund >= 0 ? 'Refund' : 'Collect'} ₹${Math.abs(refund).toLocaleString('en-IN')}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: 0 },
  primaryBtnSmall: { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer' },
  tenantList: { background: 'white', borderRadius: 10, overflow: 'hidden' },
  tenantRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f0f0f0' },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: '#E1F5EE', color: '#0F6E56', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  tenantName: { margin: 0, fontSize: 14, fontWeight: 500 },
  tenantSub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  advanceBadge: { color: '#185FA5', fontWeight: 500 },
  inviteBtn: { fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #1D9E75', background: '#E1F5EE', color: '#0F6E56', cursor: 'pointer', whiteSpace: 'nowrap' },
  inviteMsg: { fontSize: 11, color: '#1D9E75', fontWeight: 500 },
  vacateBtn: { fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', color: '#993C1D' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px 0', overflowY: 'auto' },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 380, maxHeight: '90vh', overflowY: 'auto' },
  label: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  hint: { fontSize: 11, color: '#999', margin: '4px 0 0' },
  input: { padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
  advanceSection: { background: '#F1EFE8', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  advanceSectionTitle: { margin: '0 0 4px', fontSize: 13, fontWeight: 600 },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', flex: 1 },
  checkSection: { marginBottom: 14 },
  checkSectionTitle: { fontSize: 13, fontWeight: 600, margin: '0 0 8px' },
  allClearText: { fontSize: 13, color: '#27500A', margin: 0 },
  issueRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f0f0f0' },
  issueBadge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#FCEBEB', color: '#791F1F', fontWeight: 500 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer', userSelect: 'none' },
  checkbox: { width: 20, height: 20, borderRadius: 4, border: '2px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  checkboxChecked: { background: '#1D9E75', border: '2px solid #1D9E75', color: 'white' },
  refundRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' },
  warningBox: { background: '#FAEEDA', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#854F0B', marginTop: 10 },
}
