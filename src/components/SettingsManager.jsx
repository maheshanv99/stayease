import { useState } from 'react'
import { supabase } from '../lib/supabase'

const FEATURES = [
  { key: 'invoices', label: 'Rent Invoices', desc: 'Auto-generate monthly invoices for tenants', icon: '🧾' },
  { key: 'rent_collection', label: 'Rent Collection', desc: 'Track cash payments and online payments', icon: '💰' },
  { key: 'food_management', label: 'Food Management', desc: 'Meal plans and tenant food subscriptions', icon: '🍱' },
  { key: 'reports', label: 'Reports', desc: 'Monthly income and occupancy charts', icon: '📊' },
  { key: 'maintenance', label: 'Maintenance', desc: 'Track and resolve tenant complaints', icon: '🔧' },
  { key: 'whatsapp_reminders', label: 'WhatsApp Reminders', desc: 'Send rent due reminders via WhatsApp', icon: '💬' },
  { key: 'extra_charges', label: 'Extra Charges', desc: 'Add water, electricity, laundry charges per tenant', icon: '⚡' },
]

export default function SettingsManager({ property, onFlagsChanged }) {
  const [flags, setFlags] = useState(property.feature_flags || {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function toggleFlag(key) {
    const updated = { ...flags, [key]: !flags[key] }
    setFlags(updated)
    setSaving(true)
    setSaved(false)

    await supabase
      .from('pg_properties')
      .update({ feature_flags: updated })
      .eq('id', property.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    if (onFlagsChanged) onFlagsChanged(updated)
  }

  return (
    <div>
      <div style={styles.header}>
        <h3 style={styles.title}>Feature settings</h3>
        <p style={styles.subtitle}>Enable or disable features for {property.name}</p>
        {saving && <span style={styles.savingBadge}>Saving...</span>}
        {saved && <span style={styles.savedBadge}>✓ Saved</span>}
      </div>

      <div style={styles.featureList}>
        {FEATURES.map(f => (
          <div key={f.key} style={styles.featureRow}>
            <span style={styles.icon}>{f.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={styles.featureLabel}>{f.label}</p>
              <p style={styles.featureDesc}>{f.desc}</p>
            </div>
            <div
              onClick={() => toggleFlag(f.key)}
              style={{ ...styles.toggle, ...(flags[f.key] ? styles.toggleOn : styles.toggleOff) }}
            >
              <div style={{ ...styles.toggleDot, ...(flags[f.key] ? styles.dotOn : styles.dotOff) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  header: { marginBottom: 16, position: 'relative' },
  title: { fontSize: 16, fontWeight: 600, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#666', margin: 0 },
  savingBadge: { fontSize: 12, color: '#999', position: 'absolute', top: 0, right: 0 },
  savedBadge: { fontSize: 12, color: '#1D9E75', fontWeight: 500, position: 'absolute', top: 0, right: 0 },
  featureList: { background: 'white', borderRadius: 10, overflow: 'hidden' },
  featureRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
    borderBottom: '1px solid #f0f0f0',
  },
  icon: { fontSize: 20, width: 28, textAlign: 'center' },
  featureLabel: { margin: 0, fontSize: 14, fontWeight: 500 },
  featureDesc: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  toggle: {
    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
  },
  toggleOn: { background: '#1D9E75' },
  toggleOff: { background: '#ddd' },
  toggleDot: {
    width: 18, height: 18, borderRadius: '50%', background: 'white',
    position: 'absolute', top: 3, transition: 'left 0.2s',
  },
  dotOn: { left: 23 },
  dotOff: { left: 3 },
}
