import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import PaymentsManager from '../components/PaymentsManager'

const PLANS = [
  { key: 'basic',    label: 'Basic',    price: 499,  rooms: 20 },
  { key: 'standard', label: 'Standard', price: 899,  rooms: 50 },
  { key: 'premium',  label: 'Premium',  price: 1199, rooms: 999 },
]

const STATUS_COLORS = {
  active:   { bg: '#EAF3DE', color: '#27500A' },
  inactive: { bg: '#FCEBEB', color: '#791F1F' },
  trial:    { bg: '#FAEEDA', color: '#854F0B' },
}

export default function SuperAdminDashboard() {
  const { profile, signOut } = useAuth()
  const [owners, setOwners]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('owners')
  const [showAddOwner, setShowAddOwner] = useState(false)
  const [editOwner, setEditOwner] = useState(null)
  const [msg, setMsg]             = useState('')

  // Add owner form
  const [fName,    setFName]    = useState('')
  const [fEmail,   setFEmail]   = useState('')
  const [fPhone,   setFPhone]   = useState('')
  const [fPlan,    setFPlan]    = useState('basic')
  const [fPGName,  setFPGName]  = useState('')
  const [fAddress, setFAddress] = useState('')
  const [saving,   setSaving]   = useState(false)

  useEffect(() => { loadOwners() }, [])

  async function loadOwners() {
    setLoading(true)

    // Get all owner profiles
    const { data: ownerProfiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'owner')
      .order('created_at', { ascending: false })

    if (!ownerProfiles) { setLoading(false); return }

    // For each owner, get their properties and tenant counts
    const enriched = await Promise.all(ownerProfiles.map(async owner => {
      const { data: properties } = await supabase
        .from('pg_properties')
        .select('id, name, is_active')
        .eq('owner_id', owner.id)

      const propertyIds = (properties || []).map(p => p.id)
      let tenantCount = 0
      let roomCount   = 0

      if (propertyIds.length > 0) {
        const { count: tc } = await supabase
          .from('tenants')
          .select('*', { count: 'exact', head: true })
          .in('property_id', propertyIds)
          .eq('status', 'active')

        const { count: rc } = await supabase
          .from('rooms')
          .select('*', { count: 'exact', head: true })
          .in('property_id', propertyIds)

        tenantCount = tc || 0
        roomCount   = rc || 0
      }

      return { ...owner, properties: properties || [], tenantCount, roomCount }
    }))

    setOwners(enriched)
    setLoading(false)
  }

  function showMsg(text) { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  const [credentials, setCredentials] = useState(null) // { email, password, pgName }

  async function handleAddOwner(e) {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    try {
      const { data, error } = await supabase.functions.invoke('create-owner', {
        body: { email: fEmail, fullName: fName, phone: fPhone || null, plan: fPlan, pgName: fPGName, address: fAddress }
      })

      if (error) { showMsg(`❌ ${error.message}`); setSaving(false); return }
      if (data?.error) { showMsg(`❌ ${data.error}`); setSaving(false); return }

      setFName(''); setFEmail(''); setFPhone(''); setFPlan('basic'); setFPGName(''); setFAddress('')
      setShowAddOwner(false)
      setCredentials({ email: fEmail, password: data.tempPassword, pgName: fPGName, name: fName })
      loadOwners()
    } catch (err) {
      showMsg(`❌ ${err.message}`)
    }
    setSaving(false)
  }

  async function toggleStatus(owner) {
    const newStatus = owner.subscription_status === 'active' ? 'inactive' : 'active'
    await supabase.from('profiles')
      .update({ subscription_status: newStatus })
      .eq('id', owner.id)
    showMsg(`✓ ${owner.full_name} ${newStatus === 'active' ? 'activated' : 'deactivated'}`)
    loadOwners()
  }

  async function updatePlan(owner, plan) {
    const p = PLANS.find(x => x.key === plan)
    await supabase.from('profiles').update({
      subscription_plan: plan,
      max_rooms:         p.rooms,
    }).eq('id', owner.id)
    setEditOwner(null)
    showMsg(`✓ ${owner.full_name} plan updated to ${p.label}`)
    loadOwners()
  }

  async function updateSubEnd(owner, date) {
    await supabase.from('profiles').update({ subscription_end: date }).eq('id', owner.id)
    showMsg(`✓ Subscription end date updated`)
    loadOwners()
  }

  // Helper — effective price for an owner (custom overrides plan default)
  function effectivePrice(owner) {
    if (owner.custom_price != null) return owner.custom_price
    return PLANS.find(p => p.key === owner.subscription_plan)?.price || 499
  }

  // Summary stats
  const totalOwners    = owners.length
  const activeOwners   = owners.filter(o => o.subscription_status === 'active').length
  const totalRevenue   = owners
    .filter(o => o.subscription_status === 'active')
    .reduce((s, o) => s + effectivePrice(o), 0)
  const totalTenants   = owners.reduce((s, o) => s + o.tenantCount, 0)
  const totalPGs       = owners.reduce((s, o) => s + o.properties.length, 0)

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <h2 style={styles.logo}>🏠 StayEase</h2>
          <span style={styles.adminBadge}>Super Admin</span>
        </div>
        <div style={styles.topbarRight}>
          <span style={styles.userName}>{profile?.full_name}</span>
          <button onClick={signOut} style={styles.logoutBtn}>Log out</button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={styles.statsStrip}>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Total PG owners</p>
          <p style={styles.statVal}>{totalOwners}</p>
          <p style={styles.statSub}>{activeOwners} active</p>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Total PGs</p>
          <p style={styles.statVal}>{totalPGs}</p>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Total tenants</p>
          <p style={styles.statVal}>{totalTenants}</p>
        </div>
        <div style={{ ...styles.statCard, background: '#EAF3DE' }}>
          <p style={styles.statLabel}>Monthly revenue</p>
          <p style={{ ...styles.statVal, color: '#27500A' }}>₹{totalRevenue.toLocaleString('en-IN')}</p>
          <p style={styles.statSub}>from active subscriptions</p>
        </div>
        <div style={{ ...styles.statCard, background: '#E6F1FB' }}>
          <p style={styles.statLabel}>Yearly revenue</p>
          <p style={{ ...styles.statVal, color: '#185FA5' }}>₹{(totalRevenue * 12).toLocaleString('en-IN')}</p>
          <p style={styles.statSub}>projected</p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {['owners', 'revenue', 'payments'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ ...styles.tabBtn, ...(activeTab === t ? styles.tabBtnActive : {}) }}>
            {t === 'owners' ? '👤 PG Owners' : t === 'revenue' ? '💰 Revenue' : '💳 Payments'}
          </button>
        ))}
        <button onClick={() => setShowAddOwner(true)} style={styles.addBtn}>+ Add PG owner</button>
      </div>

      {msg && <div style={styles.msgBar}>{msg}</div>}

      <div style={styles.content}>

        {/* ── Payments tab ── */}
        {activeTab === 'payments' && (
          <PaymentsManager isSuperAdmin={true} />
        )}

        {/* ── Owners tab ── */}
        {activeTab === 'owners' && (
          loading ? <p style={{ color: '#666' }}>Loading...</p> :
          owners.length === 0 ? <p style={{ color: '#666' }}>No PG owners yet. Add your first one!</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {owners.map(owner => {
                const plan   = PLANS.find(p => p.key === owner.subscription_plan) || PLANS[0]
                const sc     = STATUS_COLORS[owner.subscription_status] || STATUS_COLORS.active
                const isEdit = editOwner === owner.id
                const subEnd = owner.subscription_end ? new Date(owner.subscription_end) : null
                const expiringSoon = subEnd && (subEnd - new Date()) < 7 * 24 * 60 * 60 * 1000

                return (
                  <div key={owner.id} style={{ ...styles.ownerCard, ...(owner.subscription_status === 'inactive' ? styles.ownerCardInactive : {}) }}>
                    <div style={styles.ownerCardTop}>
                      <div style={styles.ownerAvatar}>
                        {owner.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={styles.ownerNameRow}>
                          <span style={styles.ownerName}>{owner.full_name}</span>
                          <span style={{ ...styles.badge, background: sc.bg, color: sc.color }}>
                            {owner.subscription_status}
                          </span>
                          <span style={{ ...styles.badge, background: '#F1EFE8', color: '#444' }}>
                            {plan.label} · ₹{effectivePrice(owner)}/mo
                            {owner.custom_price != null && <span style={{ color: '#854F0B' }}> (custom)</span>}
                          </span>
                          {expiringSoon && (
                            <span style={{ ...styles.badge, background: '#FAEEDA', color: '#854F0B' }}>
                              ⚠️ Expires {subEnd.toLocaleDateString('en-IN')}
                            </span>
                          )}
                        </div>
                        <p style={styles.ownerSub}>
                          {owner.phone || 'No phone'} · {owner.properties.length} PG{owner.properties.length !== 1 ? 's' : ''} · {owner.roomCount} rooms · {owner.tenantCount} tenants
                        </p>
                        {owner.properties.length > 0 && (
                          <p style={styles.ownerPGs}>
                            {owner.properties.map(p => p.name).join(' · ')}
                          </p>
                        )}
                        {owner.subscription_end && (
                          <p style={{ ...styles.ownerSub, color: expiringSoon ? '#854F0B' : '#999' }}>
                            Subscription ends: {new Date(owner.subscription_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={styles.ownerActions}>
                        <button onClick={() => toggleStatus(owner)}
                          style={{ ...styles.actionBtn, ...(owner.subscription_status === 'active' ? styles.deactivateBtn : styles.activateBtn) }}>
                          {owner.subscription_status === 'active' ? '⏸ Deactivate' : '▶ Activate'}
                        </button>
                        <button onClick={() => setEditOwner(isEdit ? null : owner.id)} style={styles.actionBtn}>
                          ✏️ Edit plan
                        </button>
                      </div>
                    </div>

                    {/* Edit plan panel */}
                    {isEdit && (
                      <div style={styles.editPanel}>
                        <p style={styles.editPanelTitle}>Edit subscription</p>
                        <div style={styles.editPanelRow}>
                          <div style={{ flex: 2 }}>
                            <label style={styles.label}>Plan</label>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              {PLANS.map(p => (
                                <button key={p.key} type="button"
                                  onClick={() => updatePlan(owner, p.key)}
                                  style={{ ...styles.planBtn, ...(owner.subscription_plan === p.key ? styles.planBtnActive : {}) }}>
                                  {p.label}<br />
                                  <span style={{ fontSize: 11, fontWeight: 400 }}>₹{p.price}/mo · {p.rooms === 999 ? 'Unlimited' : p.rooms} rooms</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={styles.label}>Custom price (₹/mo)</label>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              <input type="number" style={{ ...styles.input, flex: 1 }} min="0"
                                placeholder={`Default: ₹${PLANS.find(p => p.key === owner.subscription_plan)?.price}`}
                                defaultValue={owner.custom_price || ''}
                                onBlur={async e => {
                                  const val = e.target.value === '' ? null : parseInt(e.target.value)
                                  await supabase.from('profiles').update({ custom_price: val }).eq('id', owner.id)
                                  showMsg(val != null ? `✓ Custom price set to ₹${val}/mo` : '✓ Custom price cleared — using plan default')
                                  loadOwners()
                                }} />
                              {owner.custom_price != null && (
                                <button style={{ ...styles.actionBtn, fontSize: 11 }}
                                  onClick={async () => {
                                    await supabase.from('profiles').update({ custom_price: null }).eq('id', owner.id)
                                    showMsg('✓ Custom price cleared')
                                    loadOwners()
                                  }}>Clear</button>
                              )}
                            </div>
                            <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>
                              Leave blank to use plan default price
                            </p>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={styles.label}>Subscription end date</label>
                            <input type="date" style={{ ...styles.input, marginTop: 4 }}
                              defaultValue={owner.subscription_end || ''}
                              onBlur={e => e.target.value && updateSubEnd(owner, e.target.value)} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ── Revenue tab ── */}
        {activeTab === 'revenue' && (
          <div>
            <div style={styles.revenueGrid}>
              {PLANS.map(plan => {
                const count   = owners.filter(o => o.subscription_plan === plan.key && o.subscription_status === 'active').length
                const revenue = count * plan.price
                return (
                  <div key={plan.key} style={styles.revenueCard}>
                    <p style={styles.revPlanName}>{plan.label}</p>
                    <p style={styles.revPrice}>₹{plan.price}/mo</p>
                    <p style={styles.revCount}>{count} subscriber{count !== 1 ? 's' : ''}</p>
                    <p style={styles.revTotal}>₹{revenue.toLocaleString('en-IN')}/mo</p>
                  </div>
                )
              })}
            </div>

            <div style={styles.revenueCard2}>
              <div style={styles.revSummaryRow}>
                <span style={styles.revSummaryLabel}>Monthly total</span>
                <span style={styles.revSummaryVal}>₹{totalRevenue.toLocaleString('en-IN')}</span>
              </div>
              <div style={styles.revSummaryRow}>
                <span style={styles.revSummaryLabel}>Yearly projected</span>
                <span style={styles.revSummaryVal}>₹{(totalRevenue * 12).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ ...styles.revSummaryRow, borderTop: '1px solid #eee', paddingTop: 10, marginTop: 4 }}>
                <span style={styles.revSummaryLabel}>Active subscribers</span>
                <span style={styles.revSummaryVal}>{activeOwners} of {totalOwners}</span>
              </div>
              <div style={styles.revSummaryRow}>
                <span style={styles.revSummaryLabel}>Break even (6 subs @ Basic)</span>
                <span style={{ ...styles.revSummaryVal, color: activeOwners >= 6 ? '#27500A' : '#854F0B' }}>
                  {activeOwners >= 6 ? '✅ Achieved' : `${6 - activeOwners} more needed`}
                </span>
              </div>
            </div>

            {/* Per-owner breakdown */}
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '20px 0 10px' }}>Per-owner breakdown</h3>
            <div style={styles.ownerRevTable}>
              <div style={styles.revTableHeader}>
                <span style={{ flex: 2 }}>Owner</span>
                <span style={{ flex: 1 }}>Plan</span>
                <span style={{ flex: 1 }}>Status</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Monthly</span>
              </div>
              {owners.map(o => {
                const plan = PLANS.find(p => p.key === o.subscription_plan) || PLANS[0]
                const sc   = STATUS_COLORS[o.subscription_status] || STATUS_COLORS.active
                const price = effectivePrice(o)
                return (
                  <div key={o.id} style={styles.revTableRow}>
                    <span style={{ flex: 2, fontSize: 14, fontWeight: 500 }}>{o.full_name}</span>
                    <span style={{ flex: 1, fontSize: 13, color: '#666' }}>
                      {plan.label}
                      {o.custom_price != null && <span style={{ color: '#854F0B', fontSize: 11 }}> (custom)</span>}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ ...styles.badge, background: sc.bg, color: sc.color }}>{o.subscription_status}</span>
                    </span>
                    <span style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 500, color: o.subscription_status === 'active' ? '#27500A' : '#999' }}>
                      {o.subscription_status === 'active' ? `₹${price}` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add Owner Modal */}
      {showAddOwner && (
        <div style={styles.overlay} onClick={() => setShowAddOwner(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add PG owner</h3>
            <p style={styles.modalSub}>They'll receive an email invite to set their password and access StayEase.</p>
            <form onSubmit={handleAddOwner} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={styles.label}>Full name *</label>
                <input style={styles.input} placeholder="e.g. Ramesh Kumar" value={fName} onChange={e => setFName(e.target.value)} required />
              </div>
              <div>
                <label style={styles.label}>Email *</label>
                <input style={styles.input} type="email" placeholder="owner@example.com" value={fEmail} onChange={e => setFEmail(e.target.value)} required />
              </div>
              <div>
                <label style={styles.label}>Phone</label>
                <input style={styles.input} placeholder="9876543210" value={fPhone} onChange={e => setFPhone(e.target.value)} />
              </div>

              <div style={styles.pgSection}>
                <p style={styles.pgSectionTitle}>🏠 PG details</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={styles.label}>PG name *</label>
                    <input style={styles.input} placeholder="e.g. Sunrise PG" value={fPGName} onChange={e => setFPGName(e.target.value)} required />
                  </div>
                  <div>
                    <label style={styles.label}>Address</label>
                    <input style={styles.input} placeholder="e.g. Whitefield, Bangalore" value={fAddress} onChange={e => setFAddress(e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <label style={styles.label}>Subscription plan</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {PLANS.map(p => (
                    <button key={p.key} type="button" onClick={() => setFPlan(p.key)}
                      style={{ ...styles.planBtn, ...(fPlan === p.key ? styles.planBtnActive : {}) }}>
                      {p.label}<br />
                      <span style={{ fontSize: 11, fontWeight: 400 }}>₹{p.price}/mo</span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={styles.infoBox}>
                <p style={{ margin: 0, fontSize: 13, color: '#185FA5' }}>
                  🎁 New owners start with a 30-day trial. You can change their plan anytime.
                </p>
              </div>
              {msg && <p style={{ fontSize: 13, color: msg.startsWith('❌') ? '#D85A30' : '#1D9E75', margin: 0, fontWeight: 500 }}>{msg}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowAddOwner(false)} style={styles.secondaryBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn} disabled={saving}>
                  {saving ? 'Sending invite...' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Credentials popup */}
      {credentials && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 36 }}>✅</span>
              <h3 style={{ margin: '8px 0 4px' }}>Owner account created!</h3>
              <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{credentials.name} · {credentials.pgName}</p>
            </div>
            <div style={styles.credBox}>
              <p style={styles.credTitle}>Login credentials — share with owner</p>
              <div style={styles.credRow}>
                <span style={styles.credLabel}>App URL</span>
                <span style={styles.credVal}>http://localhost:5173</span>
              </div>
              <div style={styles.credRow}>
                <span style={styles.credLabel}>Email</span>
                <span style={styles.credVal}>{credentials.email}</span>
              </div>
              <div style={styles.credRow}>
                <span style={styles.credLabel}>Password</span>
                <span style={{ ...styles.credVal, fontWeight: 700, fontSize: 18, color: '#1D9E75' }}>{credentials.password}</span>
              </div>
            </div>
            <button onClick={() => {
              const text = `Welcome to StayEase!\n\nYour PG "${credentials.pgName}" is ready.\n\nLogin details:\nURL: http://localhost:5173\nEmail: ${credentials.email}\nPassword: ${credentials.password}\n\nPlease change your password after first login.`
              navigator.clipboard.writeText(text)
            }} style={{ ...styles.primaryBtn, width: '100%', marginBottom: 8 }}>
              📋 Copy credentials to clipboard
            </button>
            <p style={{ fontSize: 12, color: '#999', textAlign: 'center', margin: '0 0 12px' }}>
              Share via WhatsApp or email. Ask them to change password after first login.
            </p>
            <button onClick={() => setCredentials(null)} style={{ ...styles.secondaryBtn, width: '100%' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#F1EFE8', fontFamily: 'system-ui, sans-serif' },
  topbar: { background: '#1A1A2E', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { margin: '0 0 2px', color: '#1D9E75', fontSize: 18 },
  adminBadge: { fontSize: 11, background: '#1D9E75', color: 'white', padding: '2px 8px', borderRadius: 99, fontWeight: 600 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 14 },
  userName: { fontSize: 13, color: '#aaa' },
  logoutBtn: { fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#aaa', cursor: 'pointer' },
  statsStrip: { display: 'flex', gap: 12, padding: '16px 24px', background: 'white', borderBottom: '1px solid #eee', flexWrap: 'wrap' },
  statCard: { background: '#F1EFE8', borderRadius: 10, padding: '12px 16px', minWidth: 140 },
  statLabel: { fontSize: 12, color: '#666', margin: '0 0 4px' },
  statVal: { fontSize: 22, fontWeight: 600, margin: 0 },
  statSub: { fontSize: 11, color: '#999', margin: '2px 0 0' },
  tabBar: { display: 'flex', gap: 4, padding: '10px 24px', background: 'white', borderBottom: '1px solid #eee', alignItems: 'center' },
  tabBtn: { padding: '7px 16px', fontSize: 13, borderRadius: 8, border: '1px solid transparent', background: 'none', cursor: 'pointer', color: '#555' },
  tabBtnActive: { background: '#1A1A2E', color: 'white', fontWeight: 500 },
  addBtn: { marginLeft: 'auto', padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer' },
  msgBar: { background: '#E1F5EE', color: '#0F6E56', fontSize: 13, fontWeight: 500, padding: '10px 24px' },
  content: { maxWidth: 1000, margin: '0 auto', padding: '24px' },
  ownerCard: { background: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #eee' },
  ownerCardInactive: { opacity: 0.7, background: '#fafafa' },
  ownerCardTop: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  ownerAvatar: { width: 42, height: 42, borderRadius: '50%', background: '#E1F5EE', color: '#0F6E56', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, flexShrink: 0 },
  ownerNameRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  ownerName: { fontSize: 15, fontWeight: 600 },
  ownerSub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  ownerPGs: { margin: '3px 0 0', fontSize: 12, color: '#185FA5', fontWeight: 500 },
  ownerActions: { display: 'flex', gap: 8, flexShrink: 0 },
  actionBtn: { padding: '7px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', whiteSpace: 'nowrap' },
  deactivateBtn: { background: '#FCEBEB', borderColor: '#F5C6C6', color: '#791F1F' },
  activateBtn: { background: '#EAF3DE', borderColor: '#A8D8A8', color: '#27500A' },
  editPanel: { background: '#F8F7F4', borderRadius: 10, padding: '14px 16px', marginTop: 14 },
  editPanelTitle: { fontSize: 13, fontWeight: 600, margin: '0 0 10px' },
  editPanelRow: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  planBtn: { flex: 1, padding: '10px 8px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '2px solid #ddd', background: 'white', cursor: 'pointer', textAlign: 'center', lineHeight: 1.6 },
  planBtnActive: { borderColor: '#1D9E75', background: '#E1F5EE', color: '#0F6E56' },
  revenueGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 },
  revenueCard: { background: 'white', borderRadius: 12, padding: '16px 18px' },
  revPlanName: { fontSize: 13, fontWeight: 600, margin: '0 0 6px', color: '#444' },
  revPrice: { fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: '#1D9E75' },
  revCount: { fontSize: 13, color: '#666', margin: '0 0 4px' },
  revTotal: { fontSize: 14, fontWeight: 600, margin: 0 },
  revenueCard2: { background: 'white', borderRadius: 12, padding: '16px 18px', marginBottom: 16 },
  revSummaryRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 },
  revSummaryLabel: { color: '#666' },
  revSummaryVal: { fontWeight: 600 },
  ownerRevTable: { background: 'white', borderRadius: 12, overflow: 'hidden' },
  revTableHeader: { display: 'flex', padding: '10px 16px', background: '#F8F7F4', fontSize: 12, fontWeight: 600, color: '#666' },
  revTableRow: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f0f0f0' },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 420, maxHeight: '85vh', overflowY: 'auto' },
  modalSub: { fontSize: 13, color: '#666', margin: '-8px 0 16px' },
  label: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  input: { padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
  infoBox: { background: '#E6F1FB', borderRadius: 8, padding: '10px 12px' },
  credBox: { background: '#F1EFE8', borderRadius: 10, padding: '14px 16px', marginBottom: 16 },
  credTitle: { fontSize: 12, fontWeight: 600, color: '#666', margin: '0 0 10px', textTransform: 'uppercase' },
  credRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #ddd' },
  credLabel: { fontSize: 13, color: '#666' },
  credVal: { fontSize: 14, fontWeight: 500 },
  pgSectionTitle: { margin: '0 0 8px', fontSize: 13, fontWeight: 600 },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', flex: 1 },
}
