import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function FoodManager({ propertyId }) {
  const [plans, setPlans] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [planName, setPlanName] = useState('')
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [breakfastPrice, setBreakfastPrice] = useState('')
  const [lunchPrice, setLunchPrice] = useState('')
  const [dinnerPrice, setDinnerPrice] = useState('')

  useEffect(() => { if (propertyId) { loadPlans(); loadTenants() } }, [propertyId])

  async function loadPlans() {
    setLoading(true)
    const { data } = await supabase.from('food_plans').select('*').eq('property_id', propertyId)
    setPlans(data || [])
    setLoading(false)
  }

  async function loadTenants() {
    const { data } = await supabase
      .from('tenants')
      .select('*, tenant_food_subs(*, food_plans(name))')
      .eq('property_id', propertyId)
      .eq('status', 'active')
    setTenants(data || [])
  }

  async function handleAddPlan(e) {
    e.preventDefault()
    await supabase.from('food_plans').insert({
      property_id: propertyId,
      name: planName,
      plan_type: 'monthly_fixed',
      monthly_price: parseInt(monthlyPrice) || 0,
      breakfast_price: parseInt(breakfastPrice) || 0,
      lunch_price: parseInt(lunchPrice) || 0,
      dinner_price: parseInt(dinnerPrice) || 0,
    })
    setPlanName(''); setMonthlyPrice(''); setBreakfastPrice(''); setLunchPrice(''); setDinnerPrice('')
    setShowAddPlan(false)
    loadPlans()
  }

  return (
    <div>
      <div style={styles.headerRow}>
        <h3 style={styles.title}>Food management</h3>
        <button onClick={() => setShowAddPlan(true)} style={styles.primaryBtnSmall}>+ Add plan</button>
      </div>

      <h4 style={styles.subTitle}>Meal plans</h4>
      {loading ? <p style={{ color: '#666', fontSize: 14 }}>Loading...</p> :
        plans.length === 0 ? <p style={{ color: '#666', fontSize: 14 }}>No meal plans yet. Add one to get started.</p> : (
        <div style={styles.planGrid}>
          {plans.map(p => (
            <div key={p.id} style={styles.planCard}>
              <p style={styles.planName}>{p.name}</p>
              <p style={styles.planPrice}>₹{p.monthly_price?.toLocaleString('en-IN')}/mo</p>
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                {p.breakfast_price > 0 && <div>B: ₹{p.breakfast_price}</div>}
                {p.lunch_price > 0 && <div>L: ₹{p.lunch_price}</div>}
                {p.dinner_price > 0 && <div>D: ₹{p.dinner_price}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ ...styles.subTitle, marginTop: 20 }}>Tenant subscriptions</h4>
      <div style={styles.list}>
        {tenants.map(t => {
          const sub = t.tenant_food_subs?.[0]
          return (
            <div key={t.id} style={styles.row}>
              <div style={{ flex: 1 }}>
                <p style={styles.name}>{t.full_name}</p>
                <p style={styles.sub}>{sub ? `${sub.food_plans?.name} · ${[sub.breakfast && 'B', sub.lunch && 'L', sub.dinner && 'D'].filter(Boolean).join('+')}` : 'No food plan'}</p>
              </div>
              <span style={{ ...styles.badge, ...(sub ? { background: '#EAF3DE', color: '#27500A' } : { background: '#f0f0f0', color: '#999' }) }}>
                {sub ? 'Subscribed' : 'None'}
              </span>
            </div>
          )
        })}
      </div>

      {showAddPlan && (
        <div style={styles.overlay} onClick={() => setShowAddPlan(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add meal plan</h3>
            <form onSubmit={handleAddPlan} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={styles.input} placeholder="Plan name (e.g. Veg Monthly)" value={planName} onChange={e => setPlanName(e.target.value)} required />
              <input style={styles.input} type="number" placeholder="Monthly price (₹)" value={monthlyPrice} onChange={e => setMonthlyPrice(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={styles.input} type="number" placeholder="Breakfast ₹" value={breakfastPrice} onChange={e => setBreakfastPrice(e.target.value)} />
                <input style={styles.input} type="number" placeholder="Lunch ₹" value={lunchPrice} onChange={e => setLunchPrice(e.target.value)} />
                <input style={styles.input} type="number" placeholder="Dinner ₹" value={dinnerPrice} onChange={e => setDinnerPrice(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setShowAddPlan(false)} style={styles.secondaryBtn}>Cancel</button>
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
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 600, margin: 0 },
  subTitle: { fontSize: 14, fontWeight: 600, margin: '0 0 10px', color: '#444' },
  primaryBtnSmall: { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer' },
  planGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 8 },
  planCard: { background: 'white', borderRadius: 10, padding: '12px 14px' },
  planName: { margin: 0, fontSize: 13, fontWeight: 600 },
  planPrice: { margin: '4px 0 0', fontSize: 15, fontWeight: 500, color: '#1D9E75' },
  list: { background: 'white', borderRadius: 10, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f0f0f0' },
  name: { margin: 0, fontSize: 14, fontWeight: 500 },
  sub: { margin: '2px 0 0', fontSize: 12, color: '#666' },
  badge: { fontSize: 11, padding: '3px 8px', borderRadius: 99, fontWeight: 500 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 12, padding: 24, width: 360 },
  input: { padding: '10px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', flex: 1 },
  primaryBtn: { padding: '10px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#1D9E75', color: 'white', cursor: 'pointer', flex: 1 },
  secondaryBtn: { padding: '10px 18px', fontSize: 14, borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', flex: 1 },
}
