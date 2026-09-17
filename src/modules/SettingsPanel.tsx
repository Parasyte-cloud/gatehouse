import { useCallback, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  ImageIcon,
  LockKeyhole,
  Palette,
  Puzzle,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  BROWSER_SIZES,
  GLOW_STRENGTHS,
  saveAppearance
} from '../lib/appearance'
import type { AppearancePreferences } from '../lib/appearance'
import '../gatehouse-settings.css'

export type GatehouseProfile = {
  display_name: string | null
  avatar_url: string | null
  wallpaper_id: string | null
  wallpaper_url: string | null
}

type TrustedOrigin = {
  id: string
  origin: string
  allow_same_origin: boolean
}

type SettingsTab = 'appearance' | 'profile' | 'privacy' | 'about'

const WALLPAPER_PRESETS: { id: string; label: string; swatch: string }[] = [
  { id: 'default', label: 'PArAsYtE scene', swatch: 'linear-gradient(135deg, #120c07, #06101b 55%, #03080e)' },
  { id: 'aurora-gold', label: 'Aurora gold', swatch: 'radial-gradient(circle at 30% 20%, #f2a62e, #06101b 65%)' },
  { id: 'aurora-blue', label: 'Aurora blue', swatch: 'radial-gradient(circle at 70% 20%, #2870d7, #030910 65%)' },
  { id: 'midnight', label: 'Midnight', swatch: 'linear-gradient(160deg, #030608, #0b1424 60%, #000)' },
  { id: 'sandstone', label: 'Sandstone', swatch: 'linear-gradient(160deg, #3a2c1a, #171009 70%)' }
]

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop()
  if (fromName && fromName.length <= 5) return fromName.toLowerCase()
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export default function SettingsPanel({
  user,
  appearance,
  profile,
  trustedOrigins,
  onUntrustOrigin,
  onAppearanceChange,
  onProfileChange,
  onClose
}: {
  user: User
  appearance: AppearancePreferences
  profile: GatehouseProfile | null
  trustedOrigins: TrustedOrigin[]
  onUntrustOrigin: (originId: string) => void
  onAppearanceChange: (prefs: AppearancePreferences) => void
  onProfileChange: (profile: GatehouseProfile) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<SettingsTab>('appearance')
  const [busy, setBusy] = useState<'avatar' | 'wallpaper' | null>(null)
  const [notice, setNotice] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const wallpaperInputRef = useRef<HTMLInputElement>(null)

  const currentWallpaperId = profile?.wallpaper_id || 'default'

  const applySize = useCallback((size: AppearancePreferences['size']) => {
    const next = { ...appearance, size }
    saveAppearance(next)
    onAppearanceChange(next)
  }, [appearance, onAppearanceChange])

  const applyGlow = useCallback((glow: AppearancePreferences['glow']) => {
    const next = { ...appearance, glow }
    saveAppearance(next)
    onAppearanceChange(next)
  }, [appearance, onAppearanceChange])

  const upsertProfile = useCallback(async (patch: Partial<GatehouseProfile>) => {
    const client = supabase
    if (!client) return
    const next: GatehouseProfile = {
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      wallpaper_id: profile?.wallpaper_id ?? null,
      wallpaper_url: profile?.wallpaper_url ?? null,
      ...patch
    }
    const { error } = await client
      .from('gatehouse_profiles')
      .upsert({ user_id: user.id, ...next }, { onConflict: 'user_id' })
    if (error) throw error
    onProfileChange(next)
  }, [profile, user.id, onProfileChange])

  const uploadImage = useCallback(async (file: File, kind: 'avatar' | 'wallpaper') => {
    const client = supabase
    if (!client) {
      setNotice('PArAsYtE is not connected to an account backend right now.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice('That image is larger than 5MB. Please choose a smaller file.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setNotice('Please choose an image file.')
      return
    }

    setBusy(kind)
    setNotice('')
    try {
      const path = `${user.id}/${kind}-${Date.now()}.${extensionFor(file)}`
      const { error: uploadError } = await client.storage
        .from('gatehouse-media')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const { data } = client.storage.from('gatehouse-media').getPublicUrl(path)
      const publicUrl = data.publicUrl

      if (kind === 'avatar') {
        await upsertProfile({ avatar_url: publicUrl })
        setNotice('Profile picture updated.')
      } else {
        await upsertProfile({ wallpaper_id: 'custom', wallpaper_url: publicUrl })
        setNotice('Wallpaper updated.')
      }
    } catch (error) {
      console.error('PArAsYtE image upload failed:', error)
      setNotice(
        'Could not save that image. If this is the first time, make sure the ' +
        '"gatehouse-media" storage bucket has been created (see the 0002 migration).'
      )
    } finally {
      setBusy(null)
    }
  }, [user.id, upsertProfile])

  const handleAvatarPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadImage(file, 'avatar')
  }

  const handleWallpaperPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void uploadImage(file, 'wallpaper')
  }

  const choosePresetWallpaper = async (id: string) => {
    setNotice('')
    try {
      await upsertProfile({ wallpaper_id: id, wallpaper_url: id === 'default' ? null : profile?.wallpaper_url ?? null })
    } catch (error) {
      console.error('PArAsYtE wallpaper preset save failed:', error)
      setNotice('Could not save that wallpaper choice. Please try again.')
    }
  }

  const removeAvatar = async () => {
    setNotice('')
    try {
      await upsertProfile({ avatar_url: null })
    } catch (error) {
      console.error('PArAsYtE avatar remove failed:', error)
      setNotice('Could not remove your profile picture. Please try again.')
    }
  }

  const tabs = useMemo(() => ([
    { id: 'appearance' as const, label: 'Appearance', icon: <Palette size={16} /> },
    { id: 'profile' as const, label: 'Profile', icon: <UserRound size={16} /> },
    { id: 'privacy' as const, label: 'Privacy', icon: <ShieldCheck size={16} /> },
    { id: 'about' as const, label: 'About & roadmap', icon: <Rocket size={16} /> }
  ]), [])

  return (
    <div className="gatehouseSettingsOverlay" role="dialog" aria-modal="true" aria-label="PArAsYtE settings">
      <div className="gatehouseSettingsPanel">
        <header className="gatehouseSettingsHeader">
          <h2><Palette size={18} /> Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings" title="Close">
            <X size={18} />
          </button>
        </header>

        <div className="gatehouseSettingsBody">
          <nav className="gatehouseSettingsNav" aria-label="Settings sections">
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                className={`gatehouseSettingsNavItem ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="gatehouseSettingsContent">
            {notice && <div className="gatehouseSettingsNotice">{notice}</div>}

            {tab === 'appearance' && (
              <>
                <section className="gatehouseSettingsSection">
                  <h3>Browser size</h3>
                  <p>How much room PArAsYtE's window chrome takes up.</p>
                  <div className="gatehouseSwatchGrid">
                    {BROWSER_SIZES.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`gatehouseSwatchButton ${appearance.size === option.value ? 'active' : ''}`}
                        onClick={() => applySize(option.value)}
                      >
                        <span className={`gatehouseSizePreview gatehouseSizePreview-${option.value}`} aria-hidden="true" />
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="gatehouseSettingsSection">
                  <h3>Outer glow</h3>
                  <p>The gold and blue ring-light around the PArAsYtE window.</p>
                  <div className="gatehouseSwatchGrid">
                    {GLOW_STRENGTHS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`gatehouseSwatchButton ${appearance.glow === option.value ? 'active' : ''}`}
                        onClick={() => applyGlow(option.value)}
                      >
                        <span className={`gatehouseGlowPreview gatehouseGlowPreview-${option.value}`} aria-hidden="true" />
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="gatehouseSettingsSection">
                  <h3>Wallpaper</h3>
                  <p>The background behind your PArAsYtE home screen.</p>
                  <div className="gatehouseSwatchGrid">
                    {WALLPAPER_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`gatehouseSwatchButton gatehouseWallpaperButton ${currentWallpaperId === preset.id ? 'active' : ''}`}
                        onClick={() => void choosePresetWallpaper(preset.id)}
                      >
                        <span className="gatehouseWallpaperSwatch" style={{ background: preset.swatch }} aria-hidden="true" />
                        <strong>{preset.label}</strong>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`gatehouseSwatchButton gatehouseWallpaperButton ${currentWallpaperId === 'custom' ? 'active' : ''}`}
                      onClick={() => wallpaperInputRef.current?.click()}
                      disabled={busy === 'wallpaper'}
                    >
                      {profile?.wallpaper_url && currentWallpaperId === 'custom' ? (
                        <span
                          className="gatehouseWallpaperSwatch"
                          style={{ backgroundImage: `url(${profile.wallpaper_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="gatehouseWallpaperSwatch gatehouseWallpaperSwatchUpload" aria-hidden="true">
                          <ImageIcon size={18} />
                        </span>
                      )}
                      <strong>{busy === 'wallpaper' ? 'Uploading...' : 'Upload your own'}</strong>
                    </button>
                    <input
                      ref={wallpaperInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleWallpaperPick}
                    />
                  </div>
                </section>
              </>
            )}

            {tab === 'profile' && (
              <section className="gatehouseSettingsSection">
                <h3>Profile picture</h3>
                <p>Shown in the account pill at the top of PArAsYtE.</p>
                <div className="gatehouseAvatarRow">
                  <span className="gatehouseAvatarPreview">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="Your profile picture" />
                      : <UserRound size={28} />}
                  </span>
                  <div className="gatehouseAvatarActions">
                    <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={busy === 'avatar'}>
                      {busy === 'avatar' ? 'Uploading...' : 'Upload picture'}
                    </button>
                    {profile?.avatar_url && (
                      <button type="button" className="secondary" onClick={() => void removeAvatar()}>
                        <Trash2 size={13} /> Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleAvatarPick}
                  />
                </div>
                <p className="gatehouseSettingsFinePrint">
                  Signed in as {user.email}. Pictures and wallpapers you upload are stored in your
                  own PArAsYtE account and follow you to any device you sign in on.
                </p>
              </section>
            )}

            {tab === 'privacy' && (
              <section className="gatehouseSettingsSection">
                <h3>Approved origins</h3>
                <p>Sites allowed to embed inside PArAsYtE. Remove one to stop it embedding.</p>
                {trustedOrigins.length === 0 ? (
                  <p className="gatehouseSettingsFinePrint">Nothing approved yet.</p>
                ) : (
                  <ul className="gatehouseSettingsOriginList">
                    {trustedOrigins.map(origin => (
                      <li key={origin.id}>
                        <span>
                          <LockKeyhole size={13} />
                          {origin.origin}
                          {origin.allow_same_origin && <em title="Also keeps its own session">·session</em>}
                        </span>
                        <button type="button" onClick={() => onUntrustOrigin(origin.id)} title="Remove">
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {tab === 'about' && (
              <section className="gatehouseSettingsSection">
                <h3><Sparkles size={15} /> PArAsYtE Browser</h3>
                <p>Version 0.1 (desktop). A cleaner, sandboxed way to browse together.</p>
                <h3><Puzzle size={15} /> On the roadmap</h3>
                <p>
                  Android and iOS builds, extension support, and sync across devices are being
                  actively scoped - see the project roadmap doc for the full comparison against
                  other browsers and current status.
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
