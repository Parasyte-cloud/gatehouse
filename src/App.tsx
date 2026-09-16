import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import AuthScreen from './modules/AuthScreen'
import GatehouseBrowser from './modules/GatehouseBrowser'
import './gatehouse.css'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setUser(null)
      return
    }

    let mounted = true

    void client.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data.user ?? null)
      }
    })

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
      }
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  if (user === undefined) {
    return (
      <div className="gatehouseLoading" role="status">
        Loading Gatehouse...
      </div>
    )
  }

  if (!supabase) {
    return (
      <div className="gatehouseLoading" role="status">
        Gatehouse is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
      </div>
    )
  }

  return user ? <GatehouseBrowser user={user} /> : <AuthScreen />
}
