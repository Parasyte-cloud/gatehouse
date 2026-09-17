import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck
} from 'lucide-react'
import ParasyteMark from '../components/ParasyteMark'
import ParasyteScene from '../components/ParasyteScene'
import { supabase } from '../lib/supabase'
import '../gatehouse.css'

type Mode = 'sign-in' | 'sign-up' | 'forgot-password'

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      if (mode === 'forgot-password') {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin
        })
        if (error) {
          throw error
        }
        setMessage("If an account exists for that email, we've sent a reset link.")
      } else if (mode === 'sign-in') {
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
        mode === 'forgot-password'
          ? 'Could not send a reset link right now. Please try again shortly.'
          : mode === 'sign-in'
            ? 'Could not sign in. Check your email and password and try again.'
            : 'Could not create an account. Try a different email or a stronger password.'
      )
    } finally {
      setBusy(false)
    }
  }

  const heading = mode === 'sign-in'
    ? 'Welcome to PArAsYtE Browser'
    : mode === 'sign-up'
      ? 'Create your PArAsYtE account'
      : 'Reset your password'

  const intro = mode === 'sign-in'
    ? 'Sign in to continue your journey.'
    : mode === 'sign-up'
      ? 'Your saved sites and trust choices stay scoped to your account.'
      : 'Enter your email and we will send you a secure reset link.'

  return (
    <div className="gatehouseAuthShell">
      <ParasyteScene className="gatehouseAuthScene" />

      <div className="gatehouseAuthCorner gatehouseAuthCornerTopLeft" aria-hidden="true">
        <span>EXPLORE</span>
        <span>CREATE</span>
        <span>BELONG</span>
      </div>
      <div className="gatehouseAuthCorner gatehouseAuthCornerTopRight" aria-hidden="true">
        <span>PEOPLE</span>
        <span>IDEAS</span>
        <span>A BRIGHTER WEB</span>
      </div>

      <form className="gatehouseAuthCard" onSubmit={event => void submit(event)}>
        <div className="gatehouseAuthBrandBlock">
          <div className="gatehouseAuthLogoHalo">
            <ParasyteMark size={86} />
          </div>
          <div className="gatehouseAuthBrand">
            <span>PArAsYtE</span>
            <span className="gatehouseAuthBrandSuffix"> Browser</span>
          </div>
          <span className="gatehouseAuthEyebrow">A CLEANER WEB TOGETHER</span>
        </div>

        <div className="gatehouseAuthIntro">
          <h1>{heading}</h1>
          <p>{intro}</p>
        </div>

        <div className="gatehouseAuthField">
          <Mail size={20} aria-hidden="true" />
          <input
            id="gatehouse-email"
            type="email"
            required
            autoComplete="email"
            aria-label="Email address"
            placeholder="Email or username"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </div>

        {mode !== 'forgot-password' && (
          <div className="gatehouseAuthField">
            <LockKeyhole size={20} aria-hidden="true" />
            <input
              id="gatehouse-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              aria-label="Password"
              placeholder="Password"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="gatehousePasswordToggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(value => !value)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        )
}

        {mode === 'sign-in' && (
          <div className="gatehouseAuthUtilityRow">
            <span className="gatehouseAuthRemember" title="Supabase securely persists this account session until you sign out.">
              <ShieldCheck size={15} aria-hidden="true" />
              Secure session
            </span>
            <button
              type="button"
              className="gatehouseAuthSwitch gatehouseAuthForgot"
              onClick={() => {
                setMode('forgot-password')
                setMessage('')
              }}
            >
              Forgot password?
            </button>
          </div>
        )
}

        <button className="gatehouseAuthPrimary" type="submit" disabled={busy}>
          <span>
            {mode === 'sign-in'
              ? 'Sign In'
              : mode === 'sign-up'
                ? 'Create Account'
                : 'Send Reset Link'}
          </span>
          <ArrowRight size={19} />
        </button>

        {message && <div className="gatehouseAuthMessage" role="status">{message}</div>}

        <button
          type="button"
          className="gatehouseAuthSwitch gatehouseAuthAccountSwitch"
          onClick={() => {
            setMode(mode === 'sign-up' ? 'sign-in' : mode === 'forgot-password' ? 'sign-in' : 'sign-up')
            setMessage('')
          }}
        >
          {mode === 'sign-up'
            ? 'Already have an account? Sign in'
            : mode === 'forgot-password'
              ? 'Back to sign in'
              : "Don't have an account? Create account"}
        </button>

        <div className="gatehouseAuthFooter">
          <ShieldCheck size={14} />
          A FASTER · SAFER · BRIGHTER WEB
        </div>
      </form>

      <div className="gatehouseAuthCorner gatehouseAuthCornerBottomLeft" aria-hidden="true">
        <span>BROWSE</span>
        <span>WITHOUT</span>
        <span>LIMITS</span>
      </div>
      <div className="gatehouseAuthCorner gatehouseAuthCornerBottomRight" aria-hidden="true">
        <span>MORE PRIVACY</span>
        <span>A BRIGHTER</span>
        <span>TOMORROW</span>
      </div>
    </div>
  )
}
