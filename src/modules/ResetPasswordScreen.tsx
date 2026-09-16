import { useState } from 'react'
import type { FormEvent } from 'react'
import ParasyteMark from '../components/ParasyteMark'
import { supabase } from '../lib/supabase'
import '../gatehouse.css'

// Shown when App.tsx sees Supabase's PASSWORD_RECOVERY auth event, which
// fires when a user opens the link from a "reset your password" email.
// That click carries a short-lived recovery session that's real enough to
// call updateUser with - once it succeeds, App.tsx's normal onAuthStateChange
// listener already has a full session and `onDone` just lets the regular
// user-based routing in App.tsx take back over.
export default function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const client = supabase
    if (!client) {
      return
    }

    if (password.length < 8) {
      setMessage('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const { error } = await client.auth.updateUser({ password })
      if (error) {
        throw error
      }
      onDone()
    } catch (error) {
      console.error('PArAsYtE password update failed:', error)
      setMessage('Could not update your password. Request a new reset link and try again.')
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
        <p className="gatehouseAuthTagline">Choose a new password for your account.</p>

        <label>
          New password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </label>

        <label>
          Confirm password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
          />
        </label>

        <button type="submit" disabled={busy}>
          Update password
        </button>

        {message && <div className="gatehouseAuthMessage" role="status">{message}</div>}
      </form>
    </div>
  )
}
