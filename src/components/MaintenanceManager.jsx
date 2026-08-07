import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const ICON_OPTIONS = ['🔧','⚡','📶','🛋️','🧹','🐛','🛗','💧','❄️','📋','🚪','🪟','🏗️','🔑','🛁','🚿','💡','🔌','📦','🧰']

const STATUS_COLORS = {
  open:        { bg: '#FAEEDA', color: '#854F0B' },
  in_progress: { bg: '#E6F1FB', color: '#185FA5' },
  resolved:    { bg: '#EAF3DE', color: '#27500A' },
  closed:      { bg: '#f0f0f0', color: '#666' },
}
const PRIORITY_COLORS = {
  low:    { bg: '#f0f0f0', color: '#666' },
  medium: { bg: '#FAEEDA', color: '#854F0B' },
  high:   { bg: '#FCEBEB', color: '#791F1F' },
  urgent: { bg: '#7B1F1F', color: 'white' },
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export default function MaintenanceManager({ propertyId }) {
  const [requests, setRequests]             = useState([])
  const [tenants, setTenants]               = useState([])
  const [categories, setCategories]         = useState([])
  const [loading, setLoading]               = useState(true)
  const [filter, setFilter]                 = useState('open')
  const [showAdd, setShowAdd]               = useState(false)
  const [showManageCats, setShowManageCats] = useState(false)
  const [expandedId, setExpandedId]         = useState(null)
  const [mode, setMode]                     = useState('individual')
  const [selectedTenants, setSelectedTenants] = useState([])
  const [resolveNote, setResolveNote]       = useState({})
  const [costSpent, setCostSpent]           = useState({})
  const [costNotes, setCostNotes]           = useState({})
  const [msg, setMsg]                       = useState('')

  const [fTenant,   setFTenant]   = useState('')
  const [fTitle,    setFTitle]    = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fPriority, setFPriority] = useState('medium')
  const [fDesc,     setFDesc]     = useState('')
  const [saving,    setSaving]    = useState(false)

  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('🔧')
  const [addingCat,  setAddingCat]  = useState(false)

  useEffect(() => { if (propertyId) { loadTenants(); loadCategories(); loadRequests() } }, [propertyId])
  useEffect(() => { if (propertyId) loadRequests() }, [filter])

  async function loadTenants() {
    const { data } = await supabase
      .from('tenants').select('id, full_name, rooms(room_number)')
      .eq('property_id', propertyId).eq('status', 'active').order('full_name')
    setTenants(data || [])
  }

  async function loadCategories() {
    const { data } = await supabase
      .from('maintenance_categories').select('*')
      .eq('property_id', propertyId).order('created_at', { ascending: true })
    const cats = data || []
    setCategories(cats)
    if (cats.length > 0) setFCategory(cats[0].name)
  }

  async function loadRequests() {
    setLoading(true)
    let query = supabase
      .from('maintenance_requests')
      .select('*, tenants(full_name, rooms(room_number))')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data } = await query
    setRequests(data || [])
    setLoading(false)
  }

  function showMsg(text) { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  function groupRequests(reqs) {
    const groups = []
    const seen = new Set()
    for (const r of reqs) {
      if (!r.bulk_group_id) {
        groups.push({ type: 'individual', request: r, id: r.id })
      } else {
        if (!seen.has(r.bulk_group_id)) {
          seen.add(r.bulk_group_id)
          const siblings = reqs.filter(x => x.bulk_group_id === r.bulk_group_id)
          groups.push({ type: r.is_bulk ? 'bulk' : 'multiple', request: r, siblings, id: r.bulk_group_id })
        }
      }
    }
    return groups
  }

  function toggleSelectedTenant(id) {
    setSelectedTenants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleAddCategory(e) {
    e.preventDefault()
    if (!newCatName.trim()) return
    setAddingCat(true)
    const { error } = await supabase.from('maintenance_categories').insert({
      property_id: propertyId, name: newCatName.trim(), icon: newCatIcon,
    })
    if (error) showMsg('❌ Category already exists')
    else { setNewCatName(''); setNewCatIcon('🔧'); loadCategories() }
    setAddingCat(false)
  }

  async function toggleCategory(cat) {
    await supabase.from('maintenance_categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    loadCategories()
  }

  async function deleteCategory(cat) {
    if (!confirm(`Delete category "${cat.name}"?`)) return
    await supabase.from('maintenance_categories').delete().eq('id', cat.id)
    loadCategories()
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!fTitle || !fCategory) return
    if (mode === 'individual' && !fTenant) return
    if (mode === 'multiple' && selectedTenants.length < 1) return
    setSaving(true)
    const bulkGroupId = generateUUID()

    if (mode === 'individual') {
      await supabase.from('maintenance_requests').insert({
        property_id: propertyId, tenant_id: fTenant,
        title: fTitle, category: fCategory.toLowerCase(),
        priority: fPriority, description: fDesc || null, status: 'open',
      })
      showMsg(`✓ Request raised for ${tenants.find(t => t.id === fTenant)?.full_name}`)
    } else if (mode === 'multiple') {
      for (const tid of selectedTenants) {
        await supabase.from('maintenance_requests').insert({
          property_id: propertyId, tenant_id: tid,
          title: fTitle, category: fCategory.toLowerCase(),
          priority: fPriority, description: fDesc || null,
          status: 'open', is_bulk: false, bulk_group_id: bulkGroupId,
        })
      }
      showMsg(`✓ Request raised for ${selectedTenants.length} tenants`)
    } else {
      for (const t of tenants) {
        await supabase.from('maintenance_requests').insert({
          property_id: propertyId, tenant_id: t.id,
          title: fTitle, category: fCategory.toLowerCase(),
          priority: fPriority, description: fDesc || null,
          status: 'open', is_bulk: true, bulk_group_id: bulkGroupId,
        })
      }
      showMsg(`✓ Request raised for all ${tenants.length} tenants`)
    }

    setFTenant(''); setFTitle(''); setFPriority('medium'); setFDesc('')
    setSelectedTenants([])
    setSaving(false); setShowAdd(false); loadRequests()
  }

  async function updateStatus(r, status, noteKey, group) {
    const note = resolveNote[noteKey] || ''
    const cost = parseInt(costSpent[noteKey]) || 0
    const cNote = costNotes[noteKey] || ''

    const update = {
      status,
      ...(status === 'resolved' || status === 'closed' ? {
        resolved_at: new Date().toISOString(),
        resolved_notes: note || null,
        cost_spent: cost,
        cost_notes: cNote || null,
      } : {}),
    }

    if (group && r.bulk_group_id) {
      await supabase.from('maintenance_requests').update(update).eq('bulk_group_id', r.bulk_group_id)
    } else {
      await supabase.from('maintenance_requests').update(update).eq('id', r.id)
    }
    setResolveNote(prev => ({ ...prev, [noteKey]: '' }))
    setCostSpent(prev => ({ ...prev, [noteKey]: '' }))
    setCostNotes(prev => ({ ...prev, [noteKey]: '' }))
    loadRequests()
  }

  async function deleteRequest(r, group) {
    const label = group ? `"${r.title}" for ${group.siblings.length} tenants` : `"${r.title}"`
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return
    if (group && r.bulk_group_id) {
      await supabase.from('maintenance_requests').delete().eq('bulk_group_id', r.bulk_group_id)
    } else {
      await supabase.from('maintenance_requests').delete().eq('id', r.id)
    }
    setExpandedId(null); loadRequests()
  }

  const activeCategories = categories.filter(c => c.is_active)
  const grouped = groupRequests(requests)
  const tabs = ['open', 'in_progress', 'resolved', 'closed', 'all']

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h3 style={styles.title}>Maintenance</h3>
          <p style={styles.subtitle}>Raise, track and resolve maintenance requests</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowManageCats(true)} style={styles.secondaryBtnSmall}>⚙️ Categories</button>
          <button onClick={() => setShowAdd(true)} style={styles.primaryBtnSmall}>+ Add request</button>
        </div>
      </div>

      {msg && <div style={styles.msgBar}>{msg}</div>}

      <div style={styles.tabs}>
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ ...styles.tab, ...(filter === t ? styles.tabActive : {}) }}>
            {t === 'in_progress' ? 'In Progress' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: '#666', fontSize: 14 }}>Loading...</p> :
        grouped.length === 0 ? <p style={{ color: '#666', fontSize: 14 }}>No {filter === 'all' ? '' : filter} requests found.</p> : (
        <div style={styles.list}>
          {grouped.map(group => {
            const r = group.request
            const cardId = group.id
            const isGrouped = group.type !== 'individual'
            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.open
            const pc = PRIORITY_COLORS[r.priority] || PRIORITY_COLORS.medium
            const expanded = expandedId === cardId
            const catIcon = categories.find(c => c.name.toLowerCase() === r.category)?.icon || '🔧'
            const needsCost = r.status === 'in_progress' || r.status === 'open'

            return (
              <div key={cardId} style={{ ...styles.card, ...(group.type === 'bulk' ? styles.bulkCard : group.type === 'multiple' ? styles.multiCard : {}) }}>
                <div style={styles.cardHeader} onClick={() => setExpandedId(expanded ? null : cardId)}>
                  <span style={styles.catIcon}>{catIcon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={styles.cardTitleRow}>
                      <span style={styles.cardTitle}>{r.title}</span>
                      {group.type === 'bulk' && <span style={styles.bulkBadge}>🌐 All tenants ({group.siblings.length})</span>}
                      {group.type === 'multiple' && <span style={styles.multiBadge}>👥 {group.siblings.length} tenants</span>}
                      <span style={{ ...styles.badge, background: pc.bg, color: pc.color }}>{r.priority}</span>
                      <span style={{ ...styles.badge, background: sc.bg, color: sc.color }}>{r.status.replace('_', ' ')}</span>
                      <span style={{ ...styles.badge, background: '#f0f0f0', color: '#666' }}>{catIcon} {r.category}</span>
                      {(r.cost_spent > 0) && <span style={styles.costBadge}>💸 ₹{r.cost_spent.toLocaleString('en-IN')}</span>}
                    </div>
                    <p style={styles.cardSub}>
                      {group.type === 'bulk' ? 'Common issue · All tenants' :
                       group.type === 'multiple' ? `Common issue · ${group.siblings.map(s => s.tenants?.full_name).filter(Boolean).join(', ')}` :
                       `${r.tenants?.full_name} · Room ${r.tenants?.rooms?.room_number}`
                      } · {new Date(r.created_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
                </div>

                {expanded && (
                  <div style={styles.cardBody}>
                    {r.description && <p style={styles.descText}>{r.description}</p>}
                    {r.resolved_notes && (
                      <div style={styles.resolveNoteBox}>
                        <span style={{ fontSize: 12, color: '#27500A', fontWeight: 500 }}>Resolution note: </span>
                        <span style={{ fontSize: 12, color: '#444' }}>{r.resolved_notes}</span>
                      </div>
                    )}
                    {r.cost_spent > 0 && (
                      <div style={styles.costBox}>
                        <span style={{ fontSize: 12, color: '#854F0B', fontWeight: 500 }}>💸 Cost spent: ₹{r.cost_spent.toLocaleString('en-IN')}</span>
                        {r.cost_notes && <span style={{ fontSize: 12, color: '#666' }}> — {r.cost_notes}</span>}
                      </div>
                    )}

                    {/* Cost input — shown when resolving or closing */}
                    {(r.status === 'in_progress' || r.status === 'open') && (
                      <div style={styles.costSection}>
                        <p style={styles.costSectionTitle}>💸 Cost spent on this request</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input style={{ ...styles.resolveInput, width: 120, flex: 'none' }}
                            type="number" min="0" placeholder="₹ amount"
                            value={costSpent[cardId] || ''}
                            onChange={e => setCostSpent(prev => ({ ...prev, [cardId]: e.target.value }))} />
                          <input style={{ ...styles.resolveInput, flex: 1 }}
                            placeholder="Cost notes (e.g. Plumber fee)"
                            value={costNotes[cardId] || ''}
                            onChange={e => setCostNotes(prev => ({ ...prev, [cardId]: e.target.value }))} />
                        </div>
                      </div>
                    )}

                    <div style={styles.actionRow}>
                      {r.status === 'open' && (
                        <>
                          <input style={styles.resolveInput} placeholder="Resolution note (optional)"
                            value={resolveNote[cardId] || ''}
                            onChange={e => setResolveNote(prev => ({ ...prev, [cardId]: e.target.value }))} />
                          <button onClick={() => updateStatus(r, 'in_progress', cardId, isGrouped ? group : null)} style={styles.actionBtn}>▶ Start work</button>
                        </>
                      )}
                      {r.status === 'in_progress' && (
                        <>
                          <input style={styles.resolveInput} placeholder="Resolution note (optional)"
                            value={resolveNote[cardId] || ''}
                            onChange={e => setResolveNote(prev => ({ ...prev, [cardId]: e.target.value }))} />
                          <button onClick={() => updateStatus(r, 'resolved', cardId, isGrouped ? group : null)}
                            style={{ ...styles.actionBtn, background: '#E1F5EE', color: '#0F6E56', borderColor: '#1D9E75' }}>
                            ✓ Mark resolved
                          </button>
                        </>
                      )}
                      {r.status === 'resolved' && (
                        <button onClick={() => updateStatus(r, 'closed', cardId, isGrouped ? group : null)} style={styles.actionBtn}>✕ Close</button>
                      )}
                      {(r.status === 'closed' || r.status === 'resolved') && (
                        <button onClick={() => updateStatus(r, 'open', cardId, isGrouped ? group : null)}
                          style={{ ...styles.actionBtn, color: '#854F0B', borderColor: '#EF9F27' }}>↺ Reopen</button>
                      )}
                      <select value={r.priority}
                        onChange={async e => {
                          if (isGrouped && r.bulk_group_id) {
                            await supabase.from('maintenance_requests').update({ priority: e.target.value }).eq('bulk_group_id', r.bulk_group_id)
                          } else {
                            await supabase.from('maintenance_requests').update({ priority: e.target.value }).eq('id', r.id)
                          }
                          loadRequests()
                        }} style={styles.prioritySelect}>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} priority</option>)}
                      </select>
                      <button onClick={() => deleteRequest(r, isGrouped ? group : null)} style={styles.deleteBtn}>🗑️ Delete</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Manage Categories Modal */}
      {showManageCats && (
        <div style={styles.overlay} onClick={() => setShowManageCats(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Manage categories</h3>
            <form onSubmit={handleAddCategory} style={styles.addCatForm}>
              <div>
                <label style={styles.label}>Icon</label>
                <div style={styles.iconGrid}>
                  {ICON_OPTIONS.map(icon => (
                    <button type="button" key={icon} onClick={() => setNewCatIcon(icon)}
                      style={{ ...styles.iconBtn, ...(newCatIcon === icon ? styles.iconBtnActive : {}) }}>{icon}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>New category name</label>
                  <input style={styles.input} placeholder="e.g. Roof Leak" value={newCatName} onChange={e => setNewCatName(e.target.value)} required />
                </div>
                <button type="submit" style={styles.primaryBtnSmall} disabled={addingCat}>{addingCat ? '...' : '+ Add'}</button>
              </div>
            </form>
            <p style={{ fontSize: 12, color: '#666', margin: '16px 0 8px', fontWeight: 500 }}>EXISTING CATEGORIES ({categories.length})</p>
            <div style={styles.catList}>
              {categories.map(cat => (
                <div key={cat.id} style={styles.catRow}>
                  <span style={styles.catIconSm}>{cat.icon}</span>
                  <span style={{ flex: 1, fontSize: 14, color: cat.is_active ? '#222' : '#aaa' }}>{cat.name}</span>
                  <button onClick={() => toggleCategory(cat)} style={{ ...styles.catToggle, ...(cat.is_active ? styles.catToggleOn : styles.catToggleOff) }}>
                    {cat.is_active ? 'Active' : 'Disabled'}
                  </button>
                  <button onClick={() => deleteCategory(cat)} style={styles.catDeleteBtn}>×</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowManageCats(false)} style={{ ...styles.secondaryBtn, marginTop: 16, width: '100%' }}>Done</button>
          </div>
        </div>
      )}

      {/* Add Request Modal */}
      {showAdd && (
        <div style={styles.overlay} onClick={() => setShowAdd(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add maintenance request</h3>
            <div style={styles.modeToggle}>
              <button type="button" onClick={() => setMode('individual')}
                style={{ ...styles.modeBtn, ...(mode === 'individual' ? styles.modeBtnActive : {}) }}>
                👤 Individual<span style={styles.modeSub}>One tenant</span>
              </button>
              <button type="button" onClick={() => { setMode('multiple'); setSelectedTenants([]) }}
                style={{ ...styles.modeBtn, ...(mode === 'multiple' ? styles.modeBtnActive : {}) }}>
                👥 Multiple<span style={styles.modeSub}>Select tenants</span>
              </button>
              <button type="button" onClick={() => setMode('bulk')}
                style={{ ...styles.modeBtn, ...(mode === 'bulk' ? styles.modeBtnActive : {}) }}>
                🌐 All tenants<span style={styles.modeSub}>Everyone</span>
              </button>
            </div>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mode === 'individual' && (
                <div>
                  <label style={styles.label}>Tenant *</label>
                  <select style={styles.input} value={fTenant} onChange={e => setFTenant(e.target.value)} required>
                    <option value="">Select tenant</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name} — Room {t.rooms?.room_number}</option>)}
                  </select>
                </div>
              )}
              {mode === 'multiple' && (
                <div>
                  <label style={styles.label}>Select tenants * ({selectedTenants.length} selected)</label>
                  <div style={styles.tenantCheckList}>
                    {tenants.map(t => {
                      const checked = selectedTenants.includes(t.id)
                      return (
                        <div key={t.id} style={styles.tenantCheckRow} onClick={() => toggleSelectedTenant(t.id)}>
                          <div style={{ ...styles.checkbox, ...(checked ? styles.checkboxChecked : {}) }}>{checked && '✓'}</div>
                          <span style={{ fontSize: 13 }}>{t.full_name}</span>
                          <span style={{ fontSize: 12, color: '#999', marginLeft: 'auto' }}>Room {t.rooms?.room_number}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {mode === 'bulk' && (
                <div style={styles.previewBox}>🌐 Will raise one grouped request for all <strong>{tenants.length} tenants</strong></div>
              )}
              <div>
                <label style={styles.label}>Title *</label>
                <input style={styles.input} placeholder="e.g. Water supply issue" value={fTitle} onChange={e => setFTitle(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Category</label>
                  <select style={styles.input} value={fCategory} onChange={e => setFCategory(e.target.value)}>
                    {activeCategories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Priority</label>
                  <select style={styles.input} value={fPriority} onChange={e => setFPriority(e.target.value)}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={styles.label}>Description (optional)</label>
                <textarea style={{ ...styles.input, height: 60, resize: 'vertical' }}
                  placeholder="More details..." value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowAdd(false)} style={styles.secondaryBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}
                  disabled={saving || tenants.length === 0 || (mode === 'multiple' && selectedTenants.length === 0)}>
                  {saving ? 'Saving...' :
                    mode === 'bulk' ? `Raise for all ${tenants.length} tenants` :
                    mode === 'multiple' ? `Raise for ${selectedTenants.length} tenant${selectedTenants.length !== 1 ? 's' : ''}` :
                    'Add request'}
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
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  subtitle: { fontSize: 13, color: '#666', margin: '2px 0 14px' },
  primaryBtnSmall: { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' },
  secondaryBtnSmall: { padding: '7px 14px', fontSize: 13, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', whiteSpace: 'nowrap' },
  msgBar: { background: '#E1F5EE', color: '#0F6E56', fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 8, marginBottom: 12 },
  tabs: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  tab: { padding: '6px 14px', fontSize: 13, borderRadius: 20, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  tabActive: { background: '#1D9E75', color: 'white', border: '1px solid #1D9E75', fontWeight: 500 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { background: 'white', borderRadius: 10, overflow: 'hidden', border: '1px solid #eee' },
  bulkCard: { border: '1px solid #C5DFF5' },
  multiCard: { border: '1px solid #D5C5F5' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' },
  catIcon: { fontSize: 18, flexShrink: 0 },
  cardTitleRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 },
  cardTitle: { fontSize: 14, fontWeight: 500 },
  cardSub: { margin: 0, fontSize: 12, color: '#666' },
  chevron: { fontSize: 10, color: '#aaa', flexShrink: 0 },
  bulkBadge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#E6F1FB', color: '#185FA5', fontWeight: 500 },
  multiBadge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#EDE6FB', color: '#4A185F', fontWeight: 500 },
  costBadge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#FAEEDA', color: '#854F0B', fontWeight: 500 },
  cardBody: { padding: '10px 14px 14px', borderTop: '1px solid #f0f0f0' },
  descText: { fontSize: 13, color: '#555', margin: '0 0 8px' },
  resolveNoteBox: { background: '#EAF3DE', borderRadius: 6, padding: '6px 10px', marginBottom: 8 },
  costBox: { background: '#FAEEDA', borderRadius: 6, padding: '6px 10px', marginBottom: 8 },
  costSection: { background: '#F8F7F4', borderRadius: 8, padding: '10px 12px', marginBottom: 10 },
  costSectionTitle: { fontSize: 12, fontWeight: 600, margin: '0 0 8px', color: '#444' },
  actionRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  actionBtn: { padding: '7px 14px', fontSize: 13, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', whiteSpace: 'nowrap' },
  resolveInput: { padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #ddd', flex: 1, minWidth: 140 },
  prioritySelect: { padding: '7px 10px', fontSize: 12, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer' },
  deleteBtn: { padding: '7px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #FCEBEB', background: '#FCEBEB', color: '#791F1F', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 'auto' },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500, whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 460, maxHeight: '88vh', overflowY: 'auto' },
  label: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  input: { padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', flex: 1 },
  modeToggle: { display: 'flex', gap: 8, marginBottom: 12 },
  modeBtn: { flex: 1, padding: '10px 10px', borderRadius: 10, border: '2px solid #ddd', background: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, fontSize: 13, fontWeight: 500 },
  modeBtnActive: { borderColor: '#1D9E75', background: '#E1F5EE', color: '#0F6E56' },
  modeSub: { fontSize: 11, color: '#888', fontWeight: 400 },
  previewBox: { background: '#E6F1FB', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 4 },
  tenantCheckList: { border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' },
  tenantCheckRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', userSelect: 'none' },
  checkbox: { width: 18, height: 18, borderRadius: 4, border: '2px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  checkboxChecked: { background: '#1D9E75', border: '2px solid #1D9E75', color: 'white' },
  addCatForm: { background: '#F8F7F4', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  iconGrid: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  iconBtn: { width: 36, height: 36, fontSize: 18, borderRadius: 8, border: '2px solid transparent', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { border: '2px solid #1D9E75', background: '#E1F5EE' },
  catList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' },
  catRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#F8F7F4', borderRadius: 8 },
  catIconSm: { fontSize: 16, width: 24, textAlign: 'center' },
  catToggle: { fontSize: 11, padding: '3px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 500 },
  catToggleOn: { background: '#E1F5EE', color: '#0F6E56' },
  catToggleOff: { background: '#f0f0f0', color: '#999' },
  catDeleteBtn: { border: 'none', background: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' },
}
