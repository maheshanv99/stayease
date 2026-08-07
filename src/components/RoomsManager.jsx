import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RoomsManager({ propertyId, onRoomsChanged, maxRooms = 999 }) {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [roomNumber, setRoomNumber] = useState('')
  const [sharingType, setSharingType] = useState('single')
  const [totalBeds, setTotalBeds] = useState(1)
  const [baseRent, setBaseRent] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (propertyId) loadRooms()
  }, [propertyId])

  async function loadRooms() {
    setLoading(true)
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('property_id', propertyId)
      .order('room_number', { ascending: true })
    setRooms(data || [])
    setLoading(false)
  }

  function handleSharingChange(type) {
    setSharingType(type)
    setTotalBeds(type === 'single' ? 1 : type === 'double' ? 2 : 3)
  }

  async function handleAddRoom(e) {
    e.preventDefault()
    setError('')
    if (!roomNumber || !baseRent) return

    // Check plan limit
    const usedBeds = rooms.reduce((s, r) => s + r.total_beds, 0)
    if (usedBeds >= maxRooms) {
      setError(`Your plan allows a maximum of ${maxRooms} beds. Upgrade your plan to add more rooms.`)
      return
    }

    const { error } = await supabase.from('rooms').insert({
      property_id: propertyId,
      room_number: roomNumber,
      sharing_type: sharingType,
      total_beds: totalBeds,
      base_rent: parseInt(baseRent, 10),
    })

    if (error) {
      setError(error.message.includes('duplicate') ? 'A room with this number already exists.' : error.message)
      return
    }

    setRoomNumber('')
    setBaseRent('')
    setSharingType('single')
    setTotalBeds(1)
    setShowAddRoom(false)
    loadRooms()
    if (onRoomsChanged) onRoomsChanged()
  }

  async function handleDeleteRoom(roomId) {
    if (!confirm('Delete this room? This cannot be undone.')) return
    await supabase.from('rooms').delete().eq('id', roomId)
    loadRooms()
    if (onRoomsChanged) onRoomsChanged()
  }

  const usedBeds = rooms.reduce((s, r) => s + r.total_beds, 0)
  const atLimit = maxRooms !== 999 && usedBeds >= maxRooms

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h3 style={styles.sectionTitle}>Rooms</h3>
          {maxRooms !== 999 && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: atLimit ? '#791F1F' : '#666' }}>
              {atLimit ? `⚠️ Plan limit reached (${maxRooms} beds max)` : `${usedBeds} / ${maxRooms} beds used`}
            </p>
          )}
        </div>
        <button onClick={() => setShowAddRoom(true)} style={styles.primaryBtnSmall}
          disabled={atLimit} title={atLimit ? 'Upgrade your plan to add more rooms' : ''}>
          + Add room
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#666', fontSize: 14 }}>Loading...</p>
      ) : rooms.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14 }}>No rooms added yet. Add your first room to start assigning tenants.</p>
      ) : (
        <div style={styles.roomGrid}>
          {rooms.map(r => (
            <div key={r.id} style={styles.roomCard}>
              <div style={styles.roomCardTop}>
                <span style={styles.roomNumber}>{r.room_number}</span>
                <button onClick={() => handleDeleteRoom(r.id)} style={styles.deleteBtn} title="Delete room">×</button>
              </div>
              <p style={styles.roomMeta}>{r.sharing_type} · {r.total_beds} bed{r.total_beds > 1 ? 's' : ''}</p>
              <p style={styles.roomRent}>₹{r.base_rent.toLocaleString('en-IN')}/mo</p>
            </div>
          ))}
        </div>
      )}

      {showAddRoom && (
        <div style={styles.modalOverlay} onClick={() => setShowAddRoom(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add a room</h3>
            <form onSubmit={handleAddRoom} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                style={styles.modalInput}
                placeholder="Room number (e.g. 101)"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                required
              />

              <label style={styles.label}>Sharing type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['single', 'double', 'triple'].map(type => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => handleSharingChange(type)}
                    style={{ ...styles.typeBtn, ...(sharingType === type ? styles.typeBtnActive : {}) }}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <label style={styles.label}>Total beds</label>
              <input
                style={styles.modalInput}
                type="number"
                min="1"
                max="6"
                value={totalBeds}
                onChange={(e) => setTotalBeds(parseInt(e.target.value, 10) || 1)}
                required
              />

              <label style={styles.label}>Rent per bed (₹/month)</label>
              <input
                style={styles.modalInput}
                type="number"
                placeholder="e.g. 6000"
                value={baseRent}
                onChange={(e) => setBaseRent(e.target.value)}
                required
              />

              {error && <p style={{ color: '#D85A30', fontSize: 13, margin: 0 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setShowAddRoom(false)} style={styles.secondaryBtn}>Cancel</button>
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
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: 0 },
  primaryBtnSmall: {
    padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none',
    background: '#1D9E75', color: 'white', cursor: 'pointer',
  },
  roomGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 24 },
  roomCard: { background: 'white', borderRadius: 10, padding: '10px 12px', position: 'relative' },
  roomCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  roomNumber: { fontSize: 15, fontWeight: 600 },
  deleteBtn: {
    border: 'none', background: 'none', color: '#999', fontSize: 16, cursor: 'pointer',
    lineHeight: 1, padding: 0,
  },
  roomMeta: { fontSize: 12, color: '#666', margin: '4px 0 2px', textTransform: 'capitalize' },
  roomRent: { fontSize: 13, fontWeight: 500, margin: 0 },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 360, maxHeight: '85vh', overflowY: 'auto' },
  modalInput: { padding: '10px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd' },
  label: { fontSize: 12, color: '#666', marginBottom: -4 },
  typeBtn: {
    flex: 1, padding: '8px 6px', fontSize: 13, borderRadius: 8, border: '1px solid #ddd',
    background: 'white', cursor: 'pointer', textTransform: 'capitalize',
  },
  typeBtnActive: { background: '#E1F5EE', borderColor: '#1D9E75', color: '#0F6E56', fontWeight: 500 },
  primaryBtn: {
    padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none',
    background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1,
  },
  secondaryBtn: {
    padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd',
    background: 'white', cursor: 'pointer', flex: 1,
  },
}
