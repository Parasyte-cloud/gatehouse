import { useState } from 'react'
import type { FormEvent } from 'react'
import ParasyteMark from '../components/ParasyteMark'
import { supabase } from '../lib/supabase'
import '../gatehouse.css'

type Mode = 'sign-in' | 'sign-up'

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const client = supabase
    if (!client) {
      setMessage('PArAsYtE is not configured yet (missing Supabase env vars).')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      if (mode === 'sign-in') {
        const { error } = await client.auth.signInWithPassword({ email, password })
        if (error) {
          throw error
        }
      } else {
        const { error } = await client.auth.signUp({ email, password })
        if (error) {
          throw error
        }
        setMessage('Check your email to confirm your account, then sign in.')
      }
    } catch (error) {
      console.error('PArAsYtE auth failed:', error)
      setMessage(
        mode === 'sign-in'
          ? 'Could not sign in. Check your email and password and try again.'
          : 'Could not create an account. Try a different email or a stronger password.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gatehouseAuthShell">
      <form className="gatehouseAuthCard" onSubmit={event => void submit(event)}>
        <div className="gatehouseAuthBrand">
          <ParasyteMark size={26} />
          <span>
            PArAsYtE
            <span className="gatehouseAuthBrandSuffix"> Browser</span>
          </span>
        </div>
        <span className="gatehouseAuthEyebrow">A cleaner web, together</span>
        <p className="gatehouseAuthTagline">
          Nothing is kept unless you save it. Opens what you trust, keeps everything
          else at arm's length in its own tab - no history, no pop-ups, no redirects
          out of this tab.
        </p>

        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </label>

        <button type="submit" disabled={busy}>
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>

        {message && <div className="gatehouseAuthMessage" role="status">{message}</div>}

        <button
          type="button"
          className="gatehouseAuthSwitch"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
            setMessage('')
          }}
        >
          {mode === 'sign-in' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
