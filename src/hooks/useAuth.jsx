import { useState, useEffect, useContext, createContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isInvite, setIsInvite] = useState(false)

  useEffect(() => {
    // Check sessionStorage for invite token captured in main.jsx
    const savedHash = sessionStorage.getItem('auth_redirect') || ''
    if (savedHash.includes('type=invite') || savedHash.includes('type=recovery') || savedHash === '#invite') {
      setIsInvite(true)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        setIsInvite(false)
        sessionStorage.removeItem('auth_redirect')
      }
      setSession(session)
      if (session) {
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname)
        }
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles').select('*').eq('id', userId).single()
    setProfile(data || null)
    setLoading(false)
  }

  async function signIn(email, password) {
    return await supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, isInvite, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
