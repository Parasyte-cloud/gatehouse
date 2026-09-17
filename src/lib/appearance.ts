// PArAsYtE Browser appearance engine.
//
// Ports the device-level "workstation size" / "outer ring-light" pattern
// from RA-workspace's src/lib/appearance.ts to the browser shell, renamed
// to PArAsYtE's own vocabulary. Like the RA-workspace original, this is
// deliberately device-local (localStorage), not account data - it's chrome
// density and glow intensity for the window you're looking at right now,
// not something that should silently change your other machine's UI. Avatar
// and wallpaper (account-level, cross-device) live separately in
// gatehouse_profiles/Supabase Storage - see modules/SettingsPanel.tsx.

export type BrowserSize = 'compact' | 'balanced' | 'expanded' | 'maximized'
export type GlowStrength = 'off' | 'subtle' | 'medium' | 'high'

export type AppearancePreferences = {
  size: BrowserSize
  glow: GlowStrength
}

export const BROWSER_SIZES: { value: BrowserSize; label: string; description: string }[] = [
  { value: 'compact', label: 'Compact', description: 'Tighter chrome, more room for the page.' },
  { value: 'balanced', label: 'Balanced', description: 'PArAsYtE’s default proportions.' },
  { value: 'expanded', label: 'Expanded', description: 'Roomier window, larger touch targets.' },
  { value: 'maximized', label: 'Maximized', description: 'Fills the available space edge to edge.' }
]

export const GLOW_STRENGTHS: { value: GlowStrength; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: 'No glow around the window.' },
  { value: 'subtle', label: 'Subtle', description: 'A faint gold and blue edge light.' },
  { value: 'medium', label: 'Medium', description: 'A clearly visible ring-light.' },
  { value: 'high', label: 'High', description: 'A bold, room-lighting glow.' }
]

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  size: 'balanced',
  glow: 'subtle'
}

const STORAGE_KEY = 'parasyte-browser-appearance'
export const APPEARANCE_EVENT = 'parasyte:appearance'

function isBrowserSize(value: unknown): value is BrowserSize {
  return value === 'compact' || value === 'balanced' || value === 'expanded' || value === 'maximized'
}

function isGlowStrength(value: unknown): value is GlowStrength {
  return value === 'off' || value === 'subtle' || value === 'medium' || value === 'high'
}

export function readAppearance(): AppearancePreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_APPEARANCE
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const parsed = JSON.parse(raw) as Partial<AppearancePreferences>
    return {
      size: isBrowserSize(parsed.size) ? parsed.size : DEFAULT_APPEARANCE.size,
      glow: isGlowStrength(parsed.glow) ? parsed.glow : DEFAULT_APPEARANCE.glow
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function applyAppearance(prefs: AppearancePreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-pt-size', prefs.size)
  root.setAttribute('data-pt-glow', prefs.glow)
}

export function saveAppearance(prefs: AppearancePreferences): void {
  applyAppearance(prefs)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Best-effort only - a private-browsing quota error shouldn't block
    // the appearance from applying for the rest of this session.
  }
  window.dispatchEvent(new CustomEvent<AppearancePreferences>(APPEARANCE_EVENT, { detail: prefs }))
}

/** Call once, as early as possible (see main.tsx), so there's no flash of default sizing/glow. */
export function applyStoredAppearance(): AppearancePreferences {
  const prefs = readAppearance()
  applyAppearance(prefs)
  return prefs
}
