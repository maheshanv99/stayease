import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import ChangePassword from '../components/ChangePassword'

const TABS = [
  { key: 'home',        label: '🏠 Home' },
  { key: 'invoices',    label: '🧾 Invoices' },
  { key: 'maintenance', label: '🔧 Maintenance' },
  { key: 'profile',     label: '👤 Profile' },
]

const STATUS_COLORS = {
  open:        { bg: '#FAEEDA', color: '#854F0B' },
  in_progress: { bg: '#E6F1FB', color: '#185FA5' },
  resolved:    { bg: '#EAF3DE', color: '#27500A' },
  closed:      { bg: '#f0f0f0', color: '#666' },
}

export default function TenantDashboard() {
  const { profile, signOut } = useAuth()
  const [tenant, setTenant]       = useState(null)
  const [invoices, setInvoices]   = useState([])
  const [requests, setRequests]   = useState([])
  const [extraCharges, setExtraCharges] = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('home')
  const [notLinked, setNotLinked] = useState(false)

  const [showChangePassword, setShowChangePassword] = useState(false)
  const [categories, setCategories] = useState([])
  const [showRaise, setShowRaise]   = useState(false)
  const [mTitle, setMTitle]         = useState('')
  const [mCategory, setMCategory]   = useState('')
  const [mDesc, setMDesc]           = useState('')
  const [mSaving, setMSaving]       = useState(false)
  const [mMsg, setMMss]             = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)

    const { data: t } = await supabase
      .from('tenants')
      .select('*, rooms(room_number, sharing_type, base_rent, total_beds), pg_properties(name, address)')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .single()

    if (!t) { setNotLinked(true); setLoading(false); return }
    setTenant(t)

    const [invRes, reqRes, chargeRes, catRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('tenant_id', t.id).order('billing_month', { ascending: false }),
      supabase.from('maintenance_requests').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }),
      supabase.from('extra_charges').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }),
      supabase.from('maintenance_categories').select('*').eq('property_id', t.property_id).eq('is_active', true),
    ])

    setInvoices(invRes.data || [])
    setRequests(reqRes.data || [])
    setExtraCharges(chargeRes.data || [])
    setCategories(catRes.data || [])
    if (catRes.data?.length > 0) setMCategory(catRes.data[0].name)
    setLoading(false)
  }

  async function handleRaiseMaintenance(e) {
    e.preventDefault()
    if (!mTitle || !mCategory || !tenant) return
    setMSaving(true)
    await supabase.from('maintenance_requests').insert({
      property_id: tenant.property_id,
      tenant_id:   tenant.id,
      title:       mTitle,
      category:    mCategory.toLowerCase(),
      description: mDesc || null,
      status:      'open',
      priority:    'medium',
    })
    setMTitle(''); setMDesc('')
    setMSaving(false)
    setShowRaise(false)
    setMMss('✓ Request raised! Your owner will be notified.')
    setTimeout(() => setMMss(''), 3000)
    const { data } = await supabase.from('maintenance_requests').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false })
    setRequests(data || [])
  }

  const latestInvoice = invoices[0]
  const pendingInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'overdue')
  const totalPending = pendingInvoices.reduce((s, i) => s + i.total_amount, 0)

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.topbar}><h2 style={styles.logo}>🏠 StayEase</h2></div>
      <p style={{ padding: 24, color: '#666' }}>Loading...</p>
    </div>
  )

  if (notLinked) return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.logo}>🏠 StayEase</h2>
        <button onClick={signOut} style={styles.logoutBtn}>Log out</button>
      </div>
      <div style={styles.notLinked}>
        <span style={{ fontSize: 40 }}>⏳</span>
        <h3>Waiting for approval</h3>
        <p style={{ color: '#666', fontSize: 14, maxWidth: 300, textAlign: 'center' }}>
          Your account is pending approval from your PG owner. They'll link you to your room shortly.
        </p>
        <p style={{ color: '#999', fontSize: 13 }}>Signed in as {profile?.full_name} · {profile?.phone}</p>
        <button onClick={signOut} style={{ ...styles.primaryBtn, marginTop: 16 }}>Sign out</button>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.logo}>🏠 StayEase</h2>
          <p style={styles.pgName}>{tenant?.pg_properties?.name}</p>
        </div>
        <button onClick={signOut} style={styles.logoutBtn}>Log out</button>
      </div>

      {/* Tab nav */}
      <div style={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ ...styles.tabBtn, ...(activeTab === t.key ? styles.tabBtnActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>

        {/* ── HOME ── */}
        {activeTab === 'home' && (
          <>
            {/* Room info card */}
            <div style={styles.roomCard}>
              <p style={styles.roomCardLabel}>Room {tenant?.rooms?.room_number} · Bed {tenant?.bed_number} · {tenant?.rooms?.sharing_type}</p>
              <p style={styles.roomCardRent}>₹{tenant?.rooms?.base_rent?.toLocaleString('en-IN')}<span style={{ fontSize: 14, fontWeight: 400 }}>/month</span></p>
              <p style={styles.roomCardAddress}>{tenant?.pg_properties?.address}</p>
            </div>

            {/* Pending dues */}
            {totalPending > 0 && (
              <div style={styles.dueCard}>
                <div style={{ flex: 1 }}>
                  <p style={styles.dueLabel}>Total dues pending</p>
                  <p style={styles.dueAmount}>₹{totalPending.toLocaleString('en-IN')}</p>
                </div>
                <button style={styles.payBtn} onClick={() => setActiveTab('invoices')}>View invoices →</button>
              </div>
            )}

            {/* Latest invoice breakdown */}
            {latestInvoice && (
              <div style={styles.card}>
                <p style={styles.cardTitle}>
                  Latest invoice — {new Date(latestInvoice.billing_month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                  <span style={{ ...styles.statusBadge, background: latestInvoice.status === 'paid' ? '#EAF3DE' : '#FAEEDA', color: latestInvoice.status === 'paid' ? '#27500A' : '#854F0B' }}>
                    {latestInvoice.status}
                  </span>
                </p>
                {[
                  { label: 'Base rent', val: latestInvoice.base_rent },
                  { label: 'Food charges', val: latestInvoice.food_charges, hide: !latestInvoice.food_charges },
                  { label: 'Electricity', val: latestInvoice.electricity, hide: !latestInvoice.electricity },
                  { label: 'Other charges', val: latestInvoice.other_charges, hide: !latestInvoice.other_charges },
                  { label: 'Discount', val: -latestInvoice.discount, hide: !latestInvoice.discount, green: true },
                ].filter(r => !r.hide).map(r => (
                  <div key={r.label} style={styles.breakdownRow}>
                    <span style={{ color: r.green ? '#1D9E75' : '#666' }}>{r.label}</span>
                    <span style={{ color: r.green ? '#1D9E75' : undefined }}>
                      {r.green ? '− ' : ''}₹{Math.abs(r.val).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
                <div style={{ ...styles.breakdownRow, fontWeight: 600, fontSize: 16, borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 4 }}>
                  <span>Total</span>
                  <span>₹{latestInvoice.total_amount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            {/* Extra charges this month */}
            {extraCharges.length > 0 && (
              <div style={styles.card}>
                <p style={styles.cardTitle}>Recent extra charges</p>
                {extraCharges.slice(0, 5).map(c => (
                  <div key={c.id} style={styles.breakdownRow}>
                    <span style={{ color: '#666' }}>{c.label}{c.notes ? ` (${c.notes})` : ''}</span>
                    <span>₹{c.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Open maintenance */}
            {requests.filter(r => r.status === 'open' || r.status === 'in_progress').length > 0 && (
              <div style={styles.card}>
                <p style={styles.cardTitle}>Open maintenance requests</p>
                {requests.filter(r => r.status === 'open' || r.status === 'in_progress').map(r => (
                  <div key={r.id} style={styles.breakdownRow}>
                    <span>{r.title}</span>
                    <span style={{ ...styles.statusBadge, background: STATUS_COLORS[r.status]?.bg, color: STATUS_COLORS[r.status]?.color }}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── INVOICES ── */}
        {activeTab === 'invoices' && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>All invoices</p>
            {invoices.length === 0 ? <p style={styles.empty}>No invoices yet.</p> :
              invoices.map(inv => {
                const isPaid = inv.status === 'paid'
                return (
                  <div key={inv.id} style={styles.invoiceRow}>
                    <div style={{ flex: 1 }}>
                      <p style={styles.invoiceName}>
                        {new Date(inv.billing_month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                      </p>
                      <p style={styles.invoiceSub}>
                        Due {new Date(inv.due_date).toLocaleDateString('en-IN')}
                        {inv.paid_at ? ` · Paid ${new Date(inv.paid_at).toLocaleDateString('en-IN')}` : ''}
                      </p>
                    </div>
                    <span style={{ ...styles.statusBadge, background: isPaid ? '#EAF3DE' : inv.status === 'overdue' ? '#FCEBEB' : '#FAEEDA', color: isPaid ? '#27500A' : inv.status === 'overdue' ? '#791F1F' : '#854F0B' }}>
                      {inv.status}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>₹{inv.total_amount.toLocaleString('en-IN')}</span>
                  </div>
                )
              })
            }
          </div>
        )}

        {/* ── MAINTENANCE ── */}
        {activeTab === 'maintenance' && (
          <>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>My requests</h3>
              <button onClick={() => setShowRaise(true)} style={styles.primaryBtnSmall}>+ Raise request</button>
            </div>

            {mMsg && <div style={styles.msgBar}>{mMsg}</div>}

            {requests.length === 0 ? <p style={styles.empty}>No maintenance requests yet.</p> :
              requests.map(r => {
                const sc = STATUS_COLORS[r.status] || STATUS_COLORS.open
                return (
                  <div key={r.id} style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500 }}>{r.title}</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
                          {r.category} · {new Date(r.created_at).toLocaleDateString('en-IN')}
                        </p>
                        {r.description && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#555' }}>{r.description}</p>}
                        {r.resolved_notes && (
                          <div style={{ background: '#EAF3DE', borderRadius: 6, padding: '6px 10px', marginTop: 8 }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#27500A' }}>✓ {r.resolved_notes}</p>
                          </div>
                        )}
                      </div>
                      <span style={{ ...styles.statusBadge, background: sc.bg, color: sc.color, flexShrink: 0 }}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                )
              })
            }

            {/* Raise request modal */}
            {showRaise && (
              <div style={styles.overlay} onClick={() => setShowRaise(false)}>
                <div style={styles.modal} onClick={e => e.stopPropagation()}>
                  <h3 style={{ marginTop: 0 }}>Raise a maintenance request</h3>
                  <form onSubmit={handleRaiseMaintenance} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={styles.label}>What's the issue? *</label>
                      <input style={styles.input} placeholder="e.g. Tap leaking in washroom"
                        value={mTitle} onChange={e => setMTitle(e.target.value)} required />
                    </div>
                    <div>
                      <label style={styles.label}>Category</label>
                      <select style={styles.input} value={mCategory} onChange={e => setMCategory(e.target.value)}>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={styles.label}>Description (optional)</label>
                      <textarea style={{ ...styles.input, height: 70, resize: 'vertical' }}
                        placeholder="More details..." value={mDesc} onChange={e => setMDesc(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button type="button" onClick={() => setShowRaise(false)} style={styles.secondaryBtn}>Cancel</button>
                      <button type="submit" style={styles.primaryBtn} disabled={mSaving}>
                        {mSaving ? 'Submitting...' : 'Submit request'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PROFILE ── */}
        {activeTab === 'profile' && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>My details</p>
            {[
              { label: 'Name', val: tenant?.full_name },
              { label: 'Phone', val: tenant?.phone },
              { label: 'Email', val: tenant?.email || profile?.email },
              { label: 'Room', val: `Room ${tenant?.rooms?.room_number} · Bed ${tenant?.bed_number}` },
              { label: 'Sharing', val: tenant?.rooms?.sharing_type },
              { label: 'Move-in', val: tenant?.move_in_date ? new Date(tenant.move_in_date).toLocaleDateString('en-IN') : '—' },
              { label: 'Advance paid', val: tenant?.advance_amount ? `₹${tenant.advance_amount.toLocaleString('en-IN')}` : '₹0' },
              { label: 'PG', val: tenant?.pg_properties?.name },
              { label: 'Address', val: tenant?.pg_properties?.address },
            ].map(row => (
              <div key={row.label} style={styles.profileRow}>
                <span style={styles.profileLabel}>{row.label}</span>
                <span style={styles.profileVal}>{row.val || '—'}</span>
              </div>
            ))}
            <button onClick={() => setShowChangePassword(true)} style={{ ...styles.secondaryBtn, marginTop: 8, width: '100%' }}>🔑 Change password</button>
            <button onClick={signOut} style={{ ...styles.secondaryBtn, marginTop: 8, width: '100%' }}>Log out</button>
            {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}
          </div>
        )}

      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#F1EFE8', fontFamily: 'system-ui, sans-serif' },
  topbar: { background: 'white', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' },
  logo: { margin: 0, color: '#1D9E75', fontSize: 17 },
  pgName: { margin: '1px 0 0', fontSize: 12, color: '#999' },
  logoutBtn: { fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  tabBar: { display: 'flex', background: 'white', borderBottom: '1px solid #eee', overflowX: 'auto' },
  tabBtn: { flex: 1, padding: '12px 8px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', color: '#666', whiteSpace: 'nowrap', borderBottom: '2px solid transparent' },
  tabBtnActive: { color: '#1D9E75', fontWeight: 500, borderBottom: '2px solid #1D9E75' },
  content: { maxWidth: 560, margin: '0 auto', padding: '16px' },
  notLinked: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 1rem', gap: 8 },
  roomCard: { background: '#1D9E75', borderRadius: 14, padding: '18px 20px', marginBottom: 14, color: 'white' },
  roomCardLabel: { margin: '0 0 6px', fontSize: 13, opacity: 0.85, textTransform: 'capitalize' },
  roomCardRent: { margin: '0 0 4px', fontSize: 28, fontWeight: 700 },
  roomCardAddress: { margin: 0, fontSize: 12, opacity: 0.75 },
  dueCard: { background: '#FCEBEB', borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 },
  dueLabel: { margin: '0 0 2px', fontSize: 12, color: '#791F1F' },
  dueAmount: { margin: 0, fontSize: 20, fontWeight: 700, color: '#791F1F' },
  payBtn: { padding: '8px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#791F1F', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' },
  card: { background: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: 600, margin: '0 0 10px', color: '#444', display: 'flex', alignItems: 'center', gap: 8 },
  breakdownRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
  invoiceRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f5f5f5' },
  invoiceName: { margin: 0, fontSize: 14, fontWeight: 500 },
  invoiceSub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  statusBadge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500, whiteSpace: 'nowrap' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 600, margin: 0 },
  primaryBtnSmall: { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer' },
  msgBar: { background: '#E1F5EE', color: '#0F6E56', fontSize: 13, fontWeight: 500, padding: '8px 12px', borderRadius: 8, marginBottom: 12 },
  empty: { fontSize: 13, color: '#999', margin: 0 },
  profileRow: { display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f5f5', gap: 12 },
  profileLabel: { fontSize: 13, color: '#999', width: 90, flexShrink: 0 },
  profileVal: { fontSize: 13, fontWeight: 500 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 380, maxHeight: '85vh', overflowY: 'auto' },
  label: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  input: { padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', flex: 1 },
}
