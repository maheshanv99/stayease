import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import RoomsManager from '../components/RoomsManager'
import TenantsManager from '../components/TenantsManager'
import InvoiceManager from '../components/InvoiceManager'
import RentCollection from '../components/RentCollection'
import FoodManager from '../components/FoodManager'
import ReportsManager from '../components/ReportsManager'
import MaintenanceManager from '../components/MaintenanceManager'
import SettingsManager from '../components/SettingsManager'
import ExtraChargesManager from '../components/ExtraChargesManager'
import ChangePassword from '../components/ChangePassword'
import PaymentsManager from '../components/PaymentsManager'

const DEFAULT_FLAGS = {
  invoices: true,
  rent_collection: true,
  food_management: false,
  reports: true,
  maintenance: true,
  whatsapp_reminders: false,
  extra_charges: true,
}

export default function OwnerDashboard() {
  const { profile, signOut } = useAuth()
  const [properties, setProperties]       = useState([])
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [flags, setFlags]                 = useState(DEFAULT_FLAGS)
  const [stats, setStats]                 = useState({ totalRooms: 0, occupiedBeds: 0, totalBeds: 0, pendingAmount: 0 })
  const [activeTab, setActiveTab]         = useState('rooms')
  const [loading, setLoading]             = useState(true)
  const [pendingCount, setPendingCount]   = useState(0)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showAddProperty, setShowAddProperty] = useState(false)
  const [newPropertyName, setNewPropertyName] = useState('')
  const [newPropertyAddress, setNewPropertyAddress] = useState('')

  useEffect(() => { loadProperties(); loadPendingCount() }, [])
  useEffect(() => {
    if (selectedProperty) {
      setFlags({ ...DEFAULT_FLAGS, ...selectedProperty.feature_flags })
      loadStats(selectedProperty.id)
    }
  }, [selectedProperty])

  // Poll pending count every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadPendingCount, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadPendingCount() {
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'tenant')
      .eq('linked', false)
    setPendingCount(count || 0)
  }

  async function loadProperties() {
    const { data } = await supabase.from('pg_properties').select('*').order('created_at', { ascending: true })
    if (data && data.length > 0) { setProperties(data); setSelectedProperty(data[0]) }
    else setLoading(false)
  }

  async function loadStats(propertyId) {
    setLoading(true)
    const { data: rooms } = await supabase.from('rooms').select('total_beds').eq('property_id', propertyId)
    const { data: tenants } = await supabase.from('tenants').select('id').eq('property_id', propertyId).eq('status', 'active')
    const { data: pending } = await supabase.from('invoices').select('total_amount').eq('property_id', propertyId).in('status', ['pending', 'overdue'])
    const totalBeds = (rooms || []).reduce((s, r) => s + r.total_beds, 0)
    const occupiedBeds = (tenants || []).length
    const pendingAmount = (pending || []).reduce((s, i) => s + i.total_amount, 0)
    setStats({ totalRooms: (rooms || []).length, occupiedBeds, totalBeds, pendingAmount })
    setLoading(false)
  }

  async function handleAddProperty(e) {
    e.preventDefault()
    const { data } = await supabase.from('pg_properties')
      .insert({ owner_id: profile.id, name: newPropertyName, address: newPropertyAddress })
      .select().single()
    if (data) {
      setProperties(prev => [...prev, data])
      setSelectedProperty(data)
      setNewPropertyName(''); setNewPropertyAddress('')
      setShowAddProperty(false)
    }
  }

  const occupancyPct = stats.totalBeds > 0 ? Math.round((stats.occupiedBeds / stats.totalBeds) * 100) : 0

  const allTabs = [
    { key: 'rooms',      label: '🏠 Rooms',      always: true },
    { key: 'tenants',    label: '👤 Tenants',     always: true, badge: pendingCount },
    { key: 'invoices',   label: '🧾 Invoices',    flag: 'invoices' },
    { key: 'rent',       label: '💰 Rent',        flag: 'rent_collection' },
    { key: 'food',       label: '🍱 Food',        flag: 'food_management' },
    { key: 'reports',    label: '📊 Reports',     flag: 'reports' },
    { key: 'maintenance',label: '🔧 Maintenance', flag: 'maintenance' },
    { key: 'charges',    label: '⚡ Charges',     flag: 'extra_charges' },
    { key: 'payments',   label: '💳 Payments',    always: true },
    { key: 'settings',   label: '⚙️ Settings',    always: true },
  ]
  const visibleTabs = allTabs.filter(t => t.always || flags[t.flag])

  useEffect(() => {
    const visible = visibleTabs.map(t => t.key)
    if (!visible.includes(activeTab)) setActiveTab('rooms')
  }, [flags])

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <h2 style={styles.logo}>StayEase</h2>
        <div style={styles.topbarRight}>
          <span style={styles.userName}>{profile?.full_name}</span>
          <button onClick={() => setShowChangePassword(true)} style={styles.logoutBtn}>🔑 Password</button>
          <button onClick={signOut} style={styles.logoutBtn}>Log out</button>
        </div>
      </div>
      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}

      {properties.length === 0 && !loading ? (
        <div style={styles.emptyState}>
          <h3>No properties yet</h3>
          <p style={{ color: '#666' }}>Add your first PG to get started.</p>
          <button onClick={() => setShowAddProperty(true)} style={styles.primaryBtn}>+ Add property</button>
        </div>
      ) : (
        <>
          {/* Property selector */}
          <div style={styles.propertyBar}>
            <select value={selectedProperty?.id || ''}
              onChange={e => setSelectedProperty(properties.find(p => p.id === e.target.value))}
              style={styles.propertySelect}>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name} — {p.address}</option>)}
            </select>
            <button onClick={() => setShowAddProperty(true)} style={styles.secondaryBtn}>+ Add property</button>
          </div>

          {/* Stats strip */}
          <div style={styles.statsStrip}>
            <div style={styles.statPill}><span style={styles.statPillLabel}>Occupancy</span><span style={styles.statPillVal}>{occupancyPct}%</span></div>
            <div style={styles.statPill}><span style={styles.statPillLabel}>Rooms</span><span style={styles.statPillVal}>{stats.totalRooms}</span></div>
            <div style={styles.statPill}><span style={styles.statPillLabel}>Tenants</span><span style={styles.statPillVal}>{stats.occupiedBeds}</span></div>
            <div style={{ ...styles.statPill, background: stats.pendingAmount > 0 ? '#FAEEDA' : undefined }}>
              <span style={styles.statPillLabel}>Pending rent</span>
              <span style={{ ...styles.statPillVal, color: stats.pendingAmount > 0 ? '#854F0B' : undefined }}>
                ₹{stats.pendingAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Tab nav */}
          <div style={styles.tabBar}>
            {visibleTabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{ ...styles.tabBtn, ...(activeTab === t.key ? styles.tabBtnActive : {}) }}>
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {t.label}
                  {t.badge > 0 && (
                    <span style={styles.tabBadge}>{t.badge}</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={styles.content}>
            {activeTab === 'rooms' && <RoomsManager propertyId={selectedProperty?.id} maxRooms={profile?.max_rooms || 20} onRoomsChanged={() => loadStats(selectedProperty?.id)} />}
            {activeTab === 'tenants' && (
              <>
                <TenantsManager propertyId={selectedProperty?.id} onTenantsChanged={() => loadStats(selectedProperty?.id)} />
              </>
            )}
            {activeTab === 'invoices'    && flags.invoices        && <InvoiceManager propertyId={selectedProperty?.id} />}
            {activeTab === 'rent'        && flags.rent_collection  && <RentCollection propertyId={selectedProperty?.id} />}
            {activeTab === 'food'        && flags.food_management  && <FoodManager propertyId={selectedProperty?.id} />}
            {activeTab === 'reports'     && flags.reports          && <ReportsManager propertyId={selectedProperty?.id} />}
            {activeTab === 'maintenance' && flags.maintenance      && <MaintenanceManager propertyId={selectedProperty?.id} />}
            {activeTab === 'charges'     && flags.extra_charges    && <ExtraChargesManager propertyId={selectedProperty?.id} />}
            {activeTab === 'payments'    &&                              <PaymentsManager propertyId={selectedProperty?.id} />}
            {activeTab === 'settings' && (
              <SettingsManager
                property={selectedProperty}
                onFlagsChanged={updated => {
                  setFlags({ ...DEFAULT_FLAGS, ...updated })
                  setSelectedProperty(prev => ({ ...prev, feature_flags: updated }))
                }}
              />
            )}
          </div>
        </>
      )}

      {showAddProperty && (
        <div style={styles.overlay} onClick={() => setShowAddProperty(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add a property</h3>
            <form onSubmit={handleAddProperty} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={styles.modalInput} placeholder="Property name (e.g. Sunrise PG)" value={newPropertyName} onChange={e => setNewPropertyName(e.target.value)} required />
              <input style={styles.modalInput} placeholder="Address" value={newPropertyAddress} onChange={e => setNewPropertyAddress(e.target.value)} required />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setShowAddProperty(false)} style={styles.secondaryBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#F1EFE8', fontFamily: 'system-ui, sans-serif' },
  topbar: { background: 'white', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' },
  logo: { margin: 0, color: '#1D9E75', fontSize: 18 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 14 },
  userName: { fontSize: 13, color: '#666' },
  logoutBtn: { fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: '4rem 0' },
  propertyBar: { display: 'flex', gap: 10, padding: '14px 24px', background: 'white', borderBottom: '1px solid #eee' },
  propertySelect: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 },
  statsStrip: { display: 'flex', gap: 10, padding: '12px 24px', background: 'white', borderBottom: '1px solid #eee', flexWrap: 'wrap' },
  statPill: { background: '#F1EFE8', borderRadius: 8, padding: '6px 14px', display: 'flex', gap: 8, alignItems: 'center' },
  statPillLabel: { fontSize: 12, color: '#666' },
  statPillVal: { fontSize: 14, fontWeight: 600 },
  tabBar: { display: 'flex', gap: 4, padding: '10px 24px', background: 'white', borderBottom: '1px solid #eee', overflowX: 'auto' },
  tabBtn: { padding: '7px 14px', fontSize: 13, borderRadius: 8, border: '1px solid transparent', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap', color: '#555' },
  tabBtnActive: { background: '#E1F5EE', color: '#0F6E56', fontWeight: 500, border: '1px solid #A8D8B0' },
  tabBadge: { background: '#D85A30', color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '1px 5px', minWidth: 16, textAlign: 'center' },
  content: { maxWidth: 960, margin: '0 auto', padding: '24px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 360 },
  modalInput: { padding: '10px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd' },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
}
