import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function PendingApprovals({ propertyId, onLinked }) {
  const [pending, setPending]           = useState([])
  const [rooms, setRooms]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [linking, setLinking]           = useState(null)
  const [selectedRoom, setSelectedRoom] = useState('')
  const [selectedBed, setSelectedBed]   = useState(1)
  const [msg, setMsg]                   = useState('')
  const [saving, setSaving]             = useState(false)

  useEffect(() => { if (propertyId) { loadPending(); loadRooms() } }, [propertyId])

  async function loadPending() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'tenant')
      .or('linked.eq.false,linked.is.null')
      .order('created_at', { ascending: false })
    setPending(data || [])
    setLoading(false)
  }

  async function loadRooms() {
    const { data } = await supabase
      .from('rooms').select('*')
      .eq('property_id', propertyId)
      .order('room_number')
    setRooms(data || [])
  }

  async function handleLink(e) {
    e.preventDefault()
    if (!linking || !selectedRoom) return
    setSaving(true)

    // Check if a tenant record already exists with this phone — don't create a duplicate
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('property_id', propertyId)
      .eq('phone', linking.phone || '')
      .is('user_id', null)
      .maybeSingle()  // use maybeSingle so no error if not found

    if (existingTenant) {
      // Just link the user_id to the existing record
      await supabase.from('tenants').update({
        user_id: linking.id,
        email: linking.email || null,
      }).eq('id', existingTenant.id)
    } else {
      // Check if already linked to prevent duplicates
      const { data: alreadyLinked } = await supabase
        .from('tenants')
        .select('id')
        .eq('property_id', propertyId)
        .eq('user_id', linking.id)
        .maybeSingle()

      if (!alreadyLinked) {
        // Create new tenant record only if one doesn't exist
        await supabase.from('tenants').insert({
          property_id:  propertyId,
          room_id:      selectedRoom,
          bed_number:   parseInt(selectedBed),
          full_name:    linking.full_name,
          phone:        linking.phone || '',
          email:        linking.email || null,
          user_id:      linking.id,
          move_in_date: new Date().toISOString().slice(0, 10),
          status:       'active',
        })
      }
    }

    // Mark profile as linked — this removes them from pending list
    await supabase.from('profiles').update({ linked: true }).eq('id', linking.id)

    setSaving(false)
    setLinking(null)
    setSelectedRoom('')
    setSelectedBed(1)

    // Reload pending — will now exclude this tenant
    await loadPending()
    if (onLinked) onLinked()

    setMsg(`✓ ${linking.full_name} linked successfully!`)
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleReject(profile) {
    if (!confirm(`Reject ${profile.full_name}? They won't be able to access this PG.`)) return
    await supabase.from('profiles').update({ linked: true }).eq('id', profile.id)
    await loadPending()
    if (onLinked) onLinked()
  }

  const selectedRoomData = rooms.find(r => r.id === selectedRoom)

  // Don't render anything if no pending and no message
  if (!loading && pending.length === 0 && !msg) return null

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h3 style={styles.title}>
          🔔 Pending approvals
          {pending.length > 0 && <span style={styles.countBadge}>{pending.length}</span>}
        </h3>
      </div>
      <p style={styles.subtitle}>These tenants signed up and are waiting to be linked to a room.</p>

      {msg && <div style={styles.msgBar}>{msg}</div>}

      {loading ? <p style={{ fontSize: 13, color: '#666' }}>Loading...</p> : (
        <div style={styles.list}>
          {pending.map(p => (
            <div key={p.id} style={styles.pendingRow}>
              <div style={styles.avatar}>
                {p.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <p style={styles.name}>{p.full_name}</p>
                <p style={styles.sub}>{p.email}{p.phone ? ` · 📱 ${p.phone}` : ' · No phone'}</p>
                <p style={styles.joinedAt}>Signed up {new Date(p.created_at).toLocaleDateString('en-IN')}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setLinking(p); setSelectedRoom(''); setSelectedBed(1) }} style={styles.linkBtn}>
                  🔗 Link to room
                </button>
                <button onClick={() => handleReject(p)} style={styles.rejectBtn} title="Reject">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link modal */}
      {linking && (
        <div style={styles.overlay} onClick={() => !saving && setLinking(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Link {linking.full_name} to a room</h3>
            <p style={styles.modalSub}>📱 {linking.phone || 'No phone'} · {linking.email}</p>

            <form onSubmit={handleLink} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={styles.label}>Room *</label>
                <select style={styles.input} value={selectedRoom}
                  onChange={e => { setSelectedRoom(e.target.value); setSelectedBed(1) }} required>
                  <option value="">Select room</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number} — {r.sharing_type} — ₹{r.base_rent.toLocaleString('en-IN')}/mo
                    </option>
                  ))}
                </select>
              </div>

              {selectedRoomData && (
                <div>
                  <label style={styles.label}>Bed number</label>
                  <select style={styles.input} value={selectedBed}
                    onChange={e => setSelectedBed(e.target.value)}>
                    {Array.from({ length: selectedRoomData.total_beds }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>Bed {n}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={styles.infoBox}>
                <p style={{ margin: 0, fontSize: 13, color: '#185FA5' }}>
                  💡 If this tenant's phone matches an existing record, they'll be auto-linked without creating a duplicate.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setLinking(null)} style={styles.secondaryBtn} disabled={saving}>Cancel</button>
                <button type="submit" style={styles.primaryBtn} disabled={saving}>
                  {saving ? 'Linking...' : 'Confirm & link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { background: '#FFF8E6', border: '1px solid #F5D98A', borderRadius: 12, padding: '16px 18px', marginBottom: 20 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 },
  countBadge: { background: '#EF9F27', color: 'white', fontSize: 12, fontWeight: 600, padding: '1px 8px', borderRadius: 99 },
  subtitle: { fontSize: 13, color: '#666', margin: '0 0 12px' },
  msgBar: { background: '#E1F5EE', color: '#0F6E56', fontSize: 13, fontWeight: 500, padding: '8px 12px', borderRadius: 8, marginBottom: 10 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  pendingRow: { display: 'flex', alignItems: 'center', gap: 12, background: 'white', borderRadius: 10, padding: '12px 14px' },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  name: { margin: 0, fontSize: 14, fontWeight: 500 },
  sub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  joinedAt: { margin: '2px 0 0', fontSize: 11, color: '#999' },
  linkBtn: { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' },
  rejectBtn: { padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #ddd', background: 'white', color: '#999', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 400, maxHeight: '85vh', overflowY: 'auto' },
  modalSub: { fontSize: 13, color: '#666', margin: '-8px 0 16px' },
  label: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  input: { padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
  infoBox: { background: '#E6F1FB', borderRadius: 8, padding: '10px 12px' },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', flex: 1 },
}
