// PArAsYtE Browser appearance engine.
//
// Device-level appearance stays local to the device. That includes window
// sizing, glow, colour mode, sidebar behaviour and preset wallpaper choice.
// Account-level profile data (avatar and optional custom wallpaper URL) is
// still handled separately in SettingsPanel via Supabase.

export type BrowserSize = 'compact' | 'balanced' | 'expanded' | 'maximized'
export type GlowStrength = 'off' | 'subtle' | 'medium' | 'high'
export type ThemeMode = 'system' | 'light' | 'dark'
export type SidebarMode = 'always' | 'auto' | 'hidden'
export type WallpaperChoice = 'default' | 'aurora-gold' | 'aurora-blue' | 'midnight' | 'sandstone' | 'custom'

export type AppearancePreferences = {
  size: BrowserSize
  glow: GlowStrength
  theme: ThemeMode
  sidebar: SidebarMode
  wallpaper: WallpaperChoice
}

export const BROWSER_SIZES: { value: BrowserSize; label: string; description: string }[] = [
  { value: 'compact', label: 'Compact', description: 'Smaller window and tighter chrome.' },
  { value: 'balanced', label: 'Balanced', description: 'PArAsYtE’s everyday default.' },
  { value: 'expanded', label: 'Expanded', description: 'More room for pages and controls.' },
  { value: 'maximized', label: 'Maximized', description: 'Uses the full available workspace.' }
]

export const GLOW_STRENGTHS: { value: GlowStrength; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: 'No outer ring light.' },
  { value: 'subtle', label: 'Subtle', description: 'A clearly visible soft edge light.' },
  { value: 'medium', label: 'Medium', description: 'A bright cinematic ring light.' },
  { value: 'high', label: 'High', description: 'A strong room-lighting gold and blue glow.' }
]

export const THEME_MODES: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'system', label: 'System', description: 'Follow your device appearance.' },
  { value: 'dark', label: 'Dark', description: 'Deep navy liquid glass.' },
  { value: 'light', label: 'Light', description: 'Bright pearl liquid glass.' }
]

export const SIDEBAR_MODES: { value: SidebarMode; label: string; description: string }[] = [
  { value: 'always', label: 'Always', description: 'Keep the full sidebar visible.' },
  { value: 'auto', label: 'Auto-hide', description: 'Collapse it until you hover or focus.' },
  { value: 'hidden', label: 'Hidden', description: 'Hide the sidebar completely.' }
]

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  size: 'balanced',
  glow: 'medium',
  theme: 'dark',
  sidebar: 'always',
  wallpaper: 'default'
}

const STORAGE_KEY = 'parasyte-browser-appearance'
export const APPEARANCE_EVENT = 'parasyte:appearance'

function isBrowserSize(value: unknown): value is BrowserSize {
  return value === 'compact' || value === 'balanced' || value === 'expanded' || value === 'maximized'
}

function isGlowStrength(value: unknown): value is GlowStrength {
  return value === 'off' || value === 'subtle' || value === 'medium' || value === 'high'
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isSidebarMode(value: unknown): value is SidebarMode {
  return value === 'always' || value === 'auto' || value === 'hidden'
}

function isWallpaperChoice(value: unknown): value is WallpaperChoice {
  return value === 'default' || value === 'aurora-gold' || value === 'aurora-blue' || value === 'midnight' || value === 'sandstone' || value === 'custom'
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
      glow: isGlowStrength(parsed.glow) ? parsed.glow : DEFAULT_APPEARANCE.glow,
      theme: isThemeMode(parsed.theme) ? parsed.theme : DEFAULT_APPEARANCE.theme,
      sidebar: isSidebarMode(parsed.sidebar) ? parsed.sidebar : DEFAULT_APPEARANCE.sidebar,
      wallpaper: isWallpaperChoice(parsed.wallpaper) ? parsed.wallpaper : DEFAULT_APPEARANCE.wallpaper
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

function resolveEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return mode === 'light' ? 'light' : 'dark'
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyAppearance(prefs: AppearancePreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-pt-size', prefs.size)
  root.setAttribute('data-pt-glow', prefs.glow)
  root.setAttribute('data-pt-theme', prefs.theme)
  root.setAttribute('data-pt-effective-theme', resolveEffectiveTheme(prefs.theme))
  root.setAttribute('data-pt-sidebar', prefs.sidebar)
}

export function saveAppearance(prefs: AppearancePreferences): void {
  applyAppearance(prefs)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Best-effort only. Applying appearance for the live session is more
    // important than failing because private mode denied local persistence.
  }
  window.dispatchEvent(new CustomEvent<AppearancePreferences>(APPEARANCE_EVENT, { detail: prefs }))
}

/** Call once before React paints to avoid a flash of the default appearance. */
export function applyStoredAppearance(): AppearancePreferences {
  const prefs = readAppearance()
  applyAppearance(prefs)
  return prefs
}

/**
 * Keep "System" mode in sync if the OS appearance changes while PArAsYtE is
 * open. This intentionally only changes the resolved theme attribute; the
 * user's stored preference remains "system".
 */
export function installSystemThemeSync(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const media = window.matchMedia('(prefers-color-scheme: light)')
  const handleChange = () => {
    const prefs = readAppearance()
    if (prefs.theme === 'system') applyAppearance(prefs)
  }
  media.addEventListener?.('change', handleChange)
  return () => media.removeEventListener?.('change', handleChange)
}
