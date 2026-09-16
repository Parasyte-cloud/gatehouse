import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import AuthScreen from './modules/AuthScreen'
import GatehouseBrowser from './modules/GatehouseBrowser'
import ResetPasswordScreen from './modules/ResetPasswordScreen'
import './gatehouse.css'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)

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

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return
      }
      // Supabase fires this when a user opens a password-reset link from
      // their email - the click carries a short-lived recovery session, and
      // we route to a dedicated "set a new password" screen instead of
      // dropping them into the browser mid-recovery.
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true)
      }
      setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  if (user === undefined) {
    return (
      <div className="gatehouseLoading" role="status">
        Loading PArAsYtE...
      </div>
    )
  }

  if (!supabase) {
    return (
      <div className="gatehouseLoading" role="status">
        PArAsYtE is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
      </div>
    )
  }

  if (recovering) {
    return <ResetPasswordScreen onDone={() => setRecovering(false)} />
  }

  return user ? <GatehouseBrowser user={user} /> : <AuthScreen />
}
