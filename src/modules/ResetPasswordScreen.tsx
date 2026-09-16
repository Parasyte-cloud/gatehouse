import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import ParasyteMark from '../components/ParasyteMark'
import ParasyteScene from '../components/ParasyteScene'
import { supabase } from '../lib/supabase'
import '../gatehouse.css'

export default function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      <ParasyteScene className="gatehouseAuthScene" />

      <form className="gatehouseAuthCard gatehouseResetCard" onSubmit={event => void submit(event)}>
        <div className="gatehouseAuthBrandBlock">
          <div className="gatehouseAuthLogoHalo">
            <ParasyteMark size={68} />
          </div>
          <div className="gatehouseAuthBrand">
            <span>PArAsYtE</span>
            <span className="gatehouseAuthBrandSuffix"> Browser</span>
          </div>
          <span className="gatehouseAuthEyebrow">SECURE ACCOUNT RECOVERY</span>
        </div>

        <div className="gatehouseAuthIntro">
          <h1>Choose a new password</h1>
          <p>Set a strong password for your PArAsYtE account.</p>
        </div>

        <label className="gatehouseFieldLabel" htmlFor="new-password">New password</label>
        <div className="gatehouseAuthField">
          <LockKeyhole size={19} aria-hidden="true" />
          <input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="gatehousePasswordToggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword(value => !value)}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <label className="gatehouseFieldLabel" htmlFor="confirm-password">Confirm password</label>
        <div className="gatehouseAuthField">
          <ShieldCheck size={19} aria-hidden="true" />
          <input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Confirm password"
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
          />
        </div>

        <button className="gatehouseAuthPrimary" type="submit" disabled={busy}>
          <span>Update Password</span>
          <ArrowRight size={18} />
        </button>

        {message && <div className="gatehouseAuthMessage" role="status">{message}</div>}
      </form>
    </div>
  )
}
