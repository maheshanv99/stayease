import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly']

function getDateRange(period, anchor) {
  const d = anchor ? new Date(anchor) : new Date()
  let from, to
  if (period === 'daily') {
    from = new Date(d); from.setHours(0,0,0,0)
    to   = new Date(d); to.setHours(23,59,59,999)
  } else if (period === 'weekly') {
    const day = d.getDay()
    from = new Date(d); from.setDate(d.getDate() - day); from.setHours(0,0,0,0)
    to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23,59,59,999)
  } else if (period === 'monthly') {
    from = new Date(d.getFullYear(), d.getMonth(), 1)
    to   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
  } else {
    from = new Date(d.getFullYear(), 0, 1)
    to   = new Date(d.getFullYear(), 11, 31, 23, 59, 59)
  }
  return { from, to }
}

function fmt(n) { return '₹' + (n || 0).toLocaleString('en-IN') }
function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0 }

export default function ReportsManager({ propertyId }) {
  const [period, setPeriod]     = useState('monthly')
  const [anchor, setAnchor]     = useState(() => new Date().toISOString().slice(0, 10))
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => { if (propertyId) loadReport() }, [propertyId, period, anchor])

  async function loadReport() {
    setLoading(true)
    const { from, to } = getDateRange(period, anchor)
    const fromStr = from.toISOString()
    const toStr   = to.toISOString()

    // invoices in range
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*, tenants(full_name)')
      .eq('property_id', propertyId)
      .gte('created_at', fromStr).lte('created_at', toStr)

    // payments in range
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('property_id', propertyId)
      .eq('status', 'success')
      .gte('paid_at', fromStr).lte('paid_at', toStr)

    // maintenance in range
    const { data: maintenance } = await supabase
      .from('maintenance_requests')
      .select('*')
      .eq('property_id', propertyId)
      .gte('created_at', fromStr).lte('created_at', toStr)

    // extra charges in range
    const { data: extraCharges } = await supabase
      .from('extra_charges')
      .select('*, tenants(full_name)')
      .eq('property_id', propertyId)
      .gte('created_at', fromStr).lte('created_at', toStr)

    // all tenants (for advance)
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, full_name, advance_amount, move_in_date, rooms(room_number, base_rent)')
      .eq('property_id', propertyId)
      .gte('created_at', fromStr).lte('created_at', toStr)

    // all active tenants for occupancy
    const { data: activeTenants } = await supabase
      .from('tenants').select('id').eq('property_id', propertyId).eq('status', 'active')

    const { data: rooms } = await supabase
      .from('rooms').select('total_beds').eq('property_id', propertyId)

    // ── compute ──
    const totalBeds      = (rooms || []).reduce((s, r) => s + r.total_beds, 0)
    const occupied       = (activeTenants || []).length
    const rentCollected  = (invoices || []).filter(i => i.status === 'paid').reduce((s, i) => s + i.total_amount, 0)
    const rentPending    = (invoices || []).filter(i => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0)
    const rentOverdue    = (invoices || []).filter(i => i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0)
    const maintenanceCost = (maintenance || []).reduce((s, m) => s + (m.cost_spent || 0), 0)
    const extraTotal     = (extraCharges || []).reduce((s, c) => s + c.amount, 0)
    const advanceCollected = (tenants || []).reduce((s, t) => s + (t.advance_amount || 0), 0)
    const netIncome      = rentCollected + extraTotal - maintenanceCost

    // maintenance by category
    const maintenanceByCategory = (maintenance || []).reduce((acc, m) => {
      const k = m.category || 'other'
      if (!acc[k]) acc[k] = { count: 0, cost: 0 }
      acc[k].count++
      acc[k].cost += m.cost_spent || 0
      return acc
    }, {})

    // top defaulters (tenants with overdue invoices)
    const defaulters = (invoices || [])
      .filter(i => i.status === 'overdue')
      .reduce((acc, i) => {
        const name = i.tenants?.full_name || 'Unknown'
        if (!acc[name]) acc[name] = 0
        acc[name] += i.total_amount
        return acc
      }, {})

    // extra charges by label
    const chargesByLabel = (extraCharges || []).reduce((acc, c) => {
      if (!acc[c.label]) acc[c.label] = 0
      acc[c.label] += c.amount
      return acc
    }, {})

    // vacancy loss
    const vacantBeds = totalBeds - occupied
    const avgRent = occupied > 0
      ? (invoices || []).filter(i => i.status === 'paid').reduce((s, i) => s + i.base_rent, 0) / Math.max(occupied, 1)
      : 0
    const daysInPeriod = Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)))
    const vacancyLoss  = Math.round(vacantBeds * avgRent * daysInPeriod / 30)

    setData({
      from, to, totalBeds, occupied, occupancyPct: pct(occupied, totalBeds),
      rentCollected, rentPending, rentOverdue,
      maintenanceCost, extraTotal, advanceCollected, netIncome,
      maintenanceByCategory, defaulters, chargesByLabel, vacancyLoss,
      invoices: invoices || [], maintenance: maintenance || [],
      extraCharges: extraCharges || [], tenants: tenants || [],
    })
    setLoading(false)
  }

  function periodLabel() {
    if (!data) return ''
    const { from, to } = data
    if (period === 'daily')   return from.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    if (period === 'weekly')  return `${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    if (period === 'monthly') return from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    return from.getFullYear().toString()
  }

  function navPeriod(dir) {
    const d = new Date(anchor)
    if (period === 'daily')   d.setDate(d.getDate() + dir)
    if (period === 'weekly')  d.setDate(d.getDate() + dir * 7)
    if (period === 'monthly') d.setMonth(d.getMonth() + dir)
    if (period === 'yearly')  d.setFullYear(d.getFullYear() + dir)
    setAnchor(d.toISOString().slice(0, 10))
  }

  const sections = ['overview', 'rent', 'maintenance', 'charges', 'defaulters']

  return (
    <div>
      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <h3 style={styles.title}>Reports</h3>
          <p style={styles.subtitle}>Financial summary for SSB Nilaya</p>
        </div>
      </div>

      {/* Period selector */}
      <div style={styles.periodBar}>
        <div style={styles.periodTabs}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ ...styles.periodTab, ...(period === p ? styles.periodTabActive : {}) }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div style={styles.navRow}>
          <button onClick={() => navPeriod(-1)} style={styles.navBtn}>‹</button>
          <span style={styles.periodLabel}>{periodLabel()}</span>
          <button onClick={() => navPeriod(1)} style={styles.navBtn}>›</button>
          <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} style={styles.datePicker} />
        </div>
      </div>

      {/* Section tabs */}
      <div style={styles.sectionTabs}>
        {sections.map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            style={{ ...styles.sectionTab, ...(activeSection === s ? styles.sectionTabActive : {}) }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: '#666', fontSize: 14, padding: '20px 0' }}>Loading report...</p> : !data ? null : (
        <div style={{ marginTop: 16 }}>

          {/* Overview */}
          {activeSection === 'overview' && (
            <>
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <p style={styles.statLabel}>Occupancy</p>
                  <p style={styles.statVal}>{data.occupancyPct}%</p>
                  <p style={styles.statSub}>{data.occupied}/{data.totalBeds} beds</p>
                </div>
                <div style={{ ...styles.statCard, background: '#EAF3DE' }}>
                  <p style={styles.statLabel}>Rent collected</p>
                  <p style={{ ...styles.statVal, color: '#27500A' }}>{fmt(data.rentCollected)}</p>
                </div>
                <div style={{ ...styles.statCard, background: data.rentPending > 0 ? '#FAEEDA' : undefined }}>
                  <p style={styles.statLabel}>Rent pending</p>
                  <p style={{ ...styles.statVal, color: data.rentPending > 0 ? '#854F0B' : undefined }}>{fmt(data.rentPending)}</p>
                </div>
                <div style={{ ...styles.statCard, background: '#FCEBEB' }}>
                  <p style={styles.statLabel}>Maintenance cost</p>
                  <p style={{ ...styles.statVal, color: '#791F1F' }}>{fmt(data.maintenanceCost)}</p>
                </div>
                <div style={styles.statCard}>
                  <p style={styles.statLabel}>Extra charges</p>
                  <p style={styles.statVal}>{fmt(data.extraTotal)}</p>
                </div>
                <div style={styles.statCard}>
                  <p style={styles.statLabel}>Advance collected</p>
                  <p style={styles.statVal}>{fmt(data.advanceCollected)}</p>
                </div>
                <div style={{ ...styles.statCard, background: data.vacancyLoss > 0 ? '#FFF3CD' : undefined }}>
                  <p style={styles.statLabel}>Vacancy loss</p>
                  <p style={{ ...styles.statVal, color: data.vacancyLoss > 0 ? '#856404' : undefined }}>{fmt(data.vacancyLoss)}</p>
                  <p style={styles.statSub}>{data.totalBeds - data.occupied} empty bed{data.totalBeds - data.occupied !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ ...styles.statCard, background: data.netIncome > 0 ? '#EAF3DE' : '#FCEBEB', gridColumn: 'span 1' }}>
                  <p style={styles.statLabel}>Net income</p>
                  <p style={{ ...styles.statVal, color: data.netIncome > 0 ? '#27500A' : '#791F1F' }}>{fmt(data.netIncome)}</p>
                  <p style={styles.statSub}>Rent + charges − maintenance</p>
                </div>
              </div>

              {/* Net income bar */}
              <div style={styles.card}>
                <p style={styles.cardTitle}>Income vs expense breakdown</p>
                {[
                  { label: 'Rent collected', val: data.rentCollected, color: '#1D9E75' },
                  { label: 'Extra charges',  val: data.extraTotal,    color: '#2D86C5' },
                  { label: 'Maintenance cost', val: data.maintenanceCost, color: '#D85A30' },
                  { label: 'Rent pending',   val: data.rentPending,   color: '#EF9F27' },
                ].map(row => {
                  const max = Math.max(data.rentCollected + data.extraTotal, data.maintenanceCost + data.rentPending, 1)
                  return (
                    <div key={row.label} style={styles.barRow}>
                      <span style={styles.barLabel}>{row.label}</span>
                      <div style={styles.barTrack}>
                        <div style={{ width: `${(row.val / max) * 100}%`, background: row.color, height: '100%', borderRadius: 3, minWidth: row.val > 0 ? 4 : 0 }} />
                      </div>
                      <span style={styles.barAmt}>{fmt(row.val)}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Rent detail */}
          {activeSection === 'rent' && (
            <div style={styles.card}>
              <p style={styles.cardTitle}>Invoice details</p>
              {data.invoices.length === 0 ? <p style={styles.empty}>No invoices in this period.</p> : (
                data.invoices.map(inv => {
                  const colors = { paid: { bg: '#EAF3DE', color: '#27500A' }, pending: { bg: '#FAEEDA', color: '#854F0B' }, overdue: { bg: '#FCEBEB', color: '#791F1F' } }
                  const c = colors[inv.status] || colors.pending
                  return (
                    <div key={inv.id} style={styles.listRow}>
                      <div style={{ flex: 1 }}>
                        <p style={styles.rowName}>{inv.tenants?.full_name}</p>
                        <p style={styles.rowSub}>{new Date(inv.billing_month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</p>
                      </div>
                      <span style={{ ...styles.badge, background: c.bg, color: c.color }}>{inv.status}</span>
                      <span style={styles.rowAmt}>{fmt(inv.total_amount)}</span>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Maintenance detail */}
          {activeSection === 'maintenance' && (
            <>
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <p style={styles.statLabel}>Total requests</p>
                  <p style={styles.statVal}>{data.maintenance.length}</p>
                </div>
                <div style={{ ...styles.statCard, background: '#FCEBEB' }}>
                  <p style={styles.statLabel}>Total cost</p>
                  <p style={{ ...styles.statVal, color: '#791F1F' }}>{fmt(data.maintenanceCost)}</p>
                </div>
                <div style={styles.statCard}>
                  <p style={styles.statLabel}>Resolved</p>
                  <p style={styles.statVal}>{data.maintenance.filter(m => m.status === 'resolved' || m.status === 'closed').length}</p>
                </div>
              </div>

              {/* By category */}
              {Object.keys(data.maintenanceByCategory).length > 0 && (
                <div style={styles.card}>
                  <p style={styles.cardTitle}>By category</p>
                  {Object.entries(data.maintenanceByCategory)
                    .sort((a, b) => b[1].cost - a[1].cost)
                    .map(([cat, info]) => (
                      <div key={cat} style={styles.listRow}>
                        <span style={{ flex: 1, fontSize: 14, textTransform: 'capitalize' }}>{cat}</span>
                        <span style={styles.rowSub}>{info.count} request{info.count !== 1 ? 's' : ''}</span>
                        <span style={{ ...styles.rowAmt, color: info.cost > 0 ? '#791F1F' : '#999' }}>{info.cost > 0 ? fmt(info.cost) : '₹0'}</span>
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Individual requests with cost */}
              <div style={styles.card}>
                <p style={styles.cardTitle}>All requests</p>
                {data.maintenance.length === 0 ? <p style={styles.empty}>No maintenance requests in this period.</p> :
                  data.maintenance.map(m => (
                    <div key={m.id} style={styles.listRow}>
                      <div style={{ flex: 1 }}>
                        <p style={styles.rowName}>{m.title}</p>
                        <p style={styles.rowSub}>{m.category} · {m.status.replace('_', ' ')} · {new Date(m.created_at).toLocaleDateString('en-IN')}</p>
                      </div>
                      <span style={{ ...styles.rowAmt, color: m.cost_spent > 0 ? '#791F1F' : '#999' }}>
                        {m.cost_spent > 0 ? fmt(m.cost_spent) : '—'}
                      </span>
                    </div>
                  ))
                }
              </div>
            </>
          )}

          {/* Extra charges detail */}
          {activeSection === 'charges' && (
            <>
              <div style={styles.card}>
                <p style={styles.cardTitle}>Charges by type</p>
                {Object.keys(data.chargesByLabel).length === 0 ? <p style={styles.empty}>No extra charges in this period.</p> :
                  Object.entries(data.chargesByLabel)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, total]) => (
                      <div key={label} style={styles.listRow}>
                        <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
                        <span style={styles.rowAmt}>{fmt(total)}</span>
                      </div>
                    ))
                }
              </div>
              <div style={styles.card}>
                <p style={styles.cardTitle}>All charges</p>
                {data.extraCharges.length === 0 ? <p style={styles.empty}>No charges in this period.</p> :
                  data.extraCharges.map(c => (
                    <div key={c.id} style={styles.listRow}>
                      <div style={{ flex: 1 }}>
                        <p style={styles.rowName}>{c.tenants?.full_name}</p>
                        <p style={styles.rowSub}>{c.label}{c.notes ? ` · ${c.notes}` : ''}</p>
                      </div>
                      <span style={styles.rowAmt}>{fmt(c.amount)}</span>
                    </div>
                  ))
                }
              </div>
            </>
          )}

          {/* Defaulters */}
          {activeSection === 'defaulters' && (
            <>
              <div style={styles.card}>
                <p style={styles.cardTitle}>Tenants with overdue rent</p>
                {Object.keys(data.defaulters).length === 0 ? (
                  <p style={{ ...styles.empty, color: '#27500A' }}>✅ No overdue payments in this period!</p>
                ) : (
                  Object.entries(data.defaulters)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, amount]) => (
                      <div key={name} style={styles.listRow}>
                        <div style={styles.avatar}>{name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{name}</span>
                        <span style={{ ...styles.badge, background: '#FCEBEB', color: '#791F1F' }}>Overdue</span>
                        <span style={{ ...styles.rowAmt, color: '#791F1F' }}>{fmt(amount)}</span>
                      </div>
                    ))
                )}
              </div>

              {/* Advance summary */}
              <div style={styles.card}>
                <p style={styles.cardTitle}>Advance collected — new tenants this period</p>
                {data.tenants.length === 0 ? <p style={styles.empty}>No new tenants joined in this period.</p> :
                  data.tenants.map(t => (
                    <div key={t.id} style={styles.listRow}>
                      <div style={styles.avatar}>{t.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                      <div style={{ flex: 1 }}>
                        <p style={styles.rowName}>{t.full_name}</p>
                        <p style={styles.rowSub}>Room {t.rooms?.room_number} · Joined {new Date(t.move_in_date).toLocaleDateString('en-IN')}</p>
                      </div>
                      <span style={styles.rowAmt}>{fmt(t.advance_amount)}</span>
                    </div>
                  ))
                }
              </div>
            </>
          )}

        </div>
      )}
    </div>
  )
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  subtitle: { fontSize: 13, color: '#666', margin: '2px 0 12px' },
  periodBar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, background: 'white', borderRadius: 10, padding: '10px 14px' },
  periodTabs: { display: 'flex', gap: 4 },
  periodTab: { padding: '6px 14px', fontSize: 13, borderRadius: 20, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  periodTabActive: { background: '#1D9E75', color: 'white', border: '1px solid #1D9E75', fontWeight: 500 },
  navRow: { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  navBtn: { width: 28, height: 28, borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  periodLabel: { fontSize: 13, fontWeight: 500, minWidth: 140, textAlign: 'center' },
  datePicker: { padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #ddd' },
  sectionTabs: { display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' },
  sectionTab: { padding: '6px 14px', fontSize: 13, borderRadius: 20, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  sectionTabActive: { background: '#185FA5', color: 'white', border: '1px solid #185FA5', fontWeight: 500 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 14 },
  statCard: { background: 'white', borderRadius: 10, padding: '12px 14px' },
  statLabel: { fontSize: 11, color: '#666', margin: '0 0 4px' },
  statVal: { fontSize: 18, fontWeight: 600, margin: 0 },
  statSub: { fontSize: 11, color: '#999', margin: '2px 0 0' },
  card: { background: 'white', borderRadius: 10, padding: '14px 16px', marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: 600, margin: '0 0 12px', color: '#444' },
  barRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  barLabel: { fontSize: 12, color: '#666', width: 120, flexShrink: 0 },
  barTrack: { flex: 1, height: 16, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  barAmt: { fontSize: 12, fontWeight: 500, width: 80, textAlign: 'right', flexShrink: 0 },
  listRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  rowName: { margin: 0, fontSize: 14, fontWeight: 500 },
  rowSub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  rowAmt: { fontSize: 14, fontWeight: 600, flexShrink: 0 },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500, flexShrink: 0 },
  empty: { fontSize: 13, color: '#999', margin: 0 },
  avatar: { width: 30, height: 30, borderRadius: '50%', background: '#E1F5EE', color: '#0F6E56', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 },
}
