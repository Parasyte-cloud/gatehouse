import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BriefcaseBusiness,
  Compass,
  Download,
  ExternalLink,
  Figma,
  Github,
  Globe2,
  Home,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  X,
  Youtube
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import ParasyteMark from '../components/ParasyteMark'
import ParasyteScene from '../components/ParasyteScene'
import { supabase } from '../lib/supabase'
import {
  GATEHOUSE_HOME,
  buildEmbedOrigins,
  buildStorageTrustedOrigins,
  classifyGatehouseTarget,
  resolveGatehouseInput,
  safeWebUrl
} from '../lib/policy'
import { readAppearance } from '../lib/appearance'
import type { AppearancePreferences } from '../lib/appearance'
import SettingsPanel from './SettingsPanel'
import type { GatehouseProfile } from './SettingsPanel'
import '../gatehouse.css'
import '../gatehouse-browser.css'

type Site = {
  id: string
  title: string
  url: string
  category: string | null
  is_favorite: boolean
}

type TrustedOrigin = {
  id: string
  origin: string
  allow_same_origin: boolean
}

type FrameStatus = 'idle' | 'loading' | 'ready' | 'slow' | 'failed'

const MAX_HISTORY = 80
const FRAME_SLOW_MS = 7000
const FRAME_HARD_FAIL_MS = 20000

function displayAddress(value: string): string {
  return value === GATEHOUSE_HOME ? '' : value
}

function safeMessage(action: 'load' | 'save' | 'remove' | 'trust' | 'untrust'): string {
  switch (action) {
    case 'save':
      return 'Unable to save this site. Please try again.'
    case 'remove':
      return 'Unable to remove this site. Please try again.'
    case 'trust':
      return 'Unable to approve this origin. Please try again.'
    case 'untrust':
      return 'Unable to remove this approved origin. Please try again.'
    default:
      return 'Unable to load your PArAsYtE data. Please refresh or sign in again.'
  }
}

export default function GatehouseBrowser({ user }: { user: User }) {
  const [current, setCurrent] = useState(GATEHOUSE_HOME)
  const [address, setAddress] = useState('')
  const [history, setHistory] = useState<string[]>([GATEHOUSE_HOME])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [sites, setSites] = useState<Site[]>([])
  const [trustedOrigins, setTrustedOrigins] = useState<TrustedOrigin[]>([])
  const [message, setMessage] = useState('')
  const [frameStatus, setFrameStatus] = useState<FrameStatus>('idle')
  const [profile, setProfile] = useState<GatehouseProfile | null>(null)
  const [appearance, setAppearance] = useState<AppearancePreferences>(() => readAppearance())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shieldOpen, setShieldOpen] = useState(false)
  const addressRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)

  // In-memory only, by design: `history` (the back/forward stack, above) and
  // everything else on this page except `sites` and `trustedOrigins` lives in
  // React state and nowhere else. Nothing here ever touches localStorage,
  // sessionStorage, or a cookie. Closing the tab or reloading wipes it -
  // that's the whole "acts like incognito unless you save it" promise. The
  // only durable state a user has is what they explicitly starred (`sites`)
  // or explicitly approved (`trustedOrigins`), both one row per user in
  // Supabase, both delete-able from the sidebar. Do not add any client-side
  // persistence for browsing state without changing this comment - a future
  // "let's cache the history for convenience" is exactly the feature this
  // product's whole pitch says it doesn't have.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Two distinct, deliberately separate axes of trust:
  //  - embedOrigins: is this origin allowed to be embedded at all. Every row
  //    in gatehouse_trusted_origins grants this, regardless of its
  //    allow_same_origin value. This is the "approve this origin" gate -
  //    everything NOT on this list opens in a new tab instead, no exceptions.
  //  - storageTrustedOrigins: of the origins already approved above, which
  //    ones also get to keep their own cookies/localStorage/session across
  //    reloads (the sandbox's allow-same-origin flag). This is the separate,
  //    narrower "keep me signed in here" upgrade - it does nothing for an
  //    origin that isn't already embedded.
  const embedOrigins = useMemo(
    () => buildEmbedOrigins(
      trustedOrigins.map(o => o.origin),
      typeof window === 'undefined' ? undefined : window.location.origin
    ),
    [trustedOrigins]
  )
  const storageTrustedOrigins = useMemo(
    () => buildStorageTrustedOrigins(
      trustedOrigins.filter(o => o.allow_same_origin).map(o => o.origin)
    ),
    [trustedOrigins]
  )

  const currentPolicy = useMemo(
    () => classifyGatehouseTarget(current, { embedOrigins, storageTrustedOrigins }),
    [current, embedOrigins, storageTrustedOrigins]
  )

  const loadData = useCallback(async () => {
    const client = supabase
    if (!client) {
      return
    }

    try {
      const [sitesResult, originsResult] = await Promise.all([
        client
          .from('gatehouse_sites')
          .select('id,title,url,category,is_favorite')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        client
          .from('gatehouse_trusted_origins')
          .select('id,origin,allow_same_origin')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      ])

      if (sitesResult.error) {
        throw sitesResult.error
      }
      if (originsResult.error) {
        throw originsResult.error
      }
      if (!mountedRef.current) {
        return
      }

      setSites((sitesResult.data || []) as Site[])
      setTrustedOrigins((originsResult.data || []) as TrustedOrigin[])
    } catch (error) {
      console.error('PArAsYtE data load failed:', error)
      if (mountedRef.current) {
        setMessage(safeMessage('load'))
      }
    }
  }, [user.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Kept separate from loadData's Promise.all on purpose: gatehouse_profiles
  // is a newer, optional table (see supabase/migrations/0002). Until an
  // account has run that migration and someone has visited Settings once,
  // this table may not exist yet - that must never surface as the generic
  // "Unable to load your PArAsYtE data" error that a failed sites/origins
  // load shows, so a missing-table error here is swallowed and just logged.
  useEffect(() => {
    const client = supabase
    if (!client) return
    let cancelled = false

    void client
      .from('gatehouse_profiles')
      .select('display_name,avatar_url,wallpaper_id,wallpaper_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('PArAsYtE profile load skipped:', error.message)
          return
        }
        if (data) setProfile(data as GatehouseProfile)
      })

    return () => {
      cancelled = true
    }
  }, [user.id])


  // Keep the native Electron window in sync with Settings > Browser size.
  // The web build has no electronAPI, so the same preference falls back to
  // the responsive CSS shell sizing only.
  useEffect(() => {
    void window.electronAPI?.setBrowserSize?.(appearance.size)
  }, [appearance.size])

  const navigate = useCallback((value: string, push = true) => {
    const resolved = value === GATEHOUSE_HOME ? GATEHOUSE_HOME : resolveGatehouseInput(value)

    setCurrent(resolved)
    setAddress(displayAddress(resolved))
    setMessage('')
    setShieldOpen(false)

    if (!push) {
      return
    }

    setHistory(previous => {
      if (previous[historyIndex] === resolved) {
        return previous
      }
      const base = previous.slice(0, historyIndex + 1)
      const appended = [...base, resolved]
      const next = appended.slice(-MAX_HISTORY)
      setHistoryIndex(next.length - 1)
      return next
    })
  }, [historyIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        addressRef.current?.focus()
        addressRef.current?.select()
        return
      }
      if (event.altKey && event.key === 'ArrowLeft' && historyIndex > 0) {
        event.preventDefault()
        const nextIndex = historyIndex - 1
        setHistoryIndex(nextIndex)
        navigate(history[nextIndex], false)
        return
      }
      if (event.altKey && event.key === 'ArrowRight' && historyIndex < history.length - 1) {
        event.preventDefault()
        const nextIndex = historyIndex + 1
        setHistoryIndex(nextIndex)
        navigate(history[nextIndex], false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [history, historyIndex, navigate])

  useEffect(() => {
    if (currentPolicy.kind !== 'embed') {
      setFrameStatus('idle')
      return
    }
    setFrameStatus('loading')
    const slowTimeout = window.setTimeout(() => {
      setFrameStatus(status => status === 'loading' ? 'slow' : status)
    }, FRAME_SLOW_MS)
    const hardFailTimeout = window.setTimeout(() => {
      setFrameStatus(status => (status === 'loading' || status === 'slow') ? 'failed' : status)
    }, FRAME_HARD_FAIL_MS)
    return () => {
      window.clearTimeout(slowTimeout)
      window.clearTimeout(hardFailTimeout)
    }
  }, [currentPolicy.kind, current, reloadKey])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    navigate(address)
  }

  const goBack = () => {
    if (historyIndex <= 0) return
    const nextIndex = historyIndex - 1
    setHistoryIndex(nextIndex)
    navigate(history[nextIndex], false)
  }

  const goForward = () => {
    if (historyIndex >= history.length - 1) return
    const nextIndex = historyIndex + 1
    setHistoryIndex(nextIndex)
    navigate(history[nextIndex], false)
  }

  const goHome = () => navigate(GATEHOUSE_HOME)

  const openCurrentExternal = () => {
    if (current === GATEHOUSE_HOME) return
    const parsed = safeWebUrl(current)
    if (!parsed) return
    // Inside the desktop shell (see /desktop), hand this to the OS's real
    // default browser via Electron's shell.openExternal. On the plain web
    // build window.electronAPI is undefined, so this falls back to the
    // same window.open() behavior as before.
    if (window.electronAPI) {
      window.electronAPI.openExternal(parsed.toString())
      return
    }
    window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
  }

  const saveSite = async () => {
    const client = supabase
    if (!client || current === GATEHOUSE_HOME) return
    const parsed = safeWebUrl(current)
    if (!parsed) return

    try {
      const { error } = await client
        .from('gatehouse_sites')
        .upsert(
          { user_id: user.id, title: parsed.hostname, url: parsed.toString() },
          { onConflict: 'user_id,url' }
        )
      if (error) throw error
      if (mountedRef.current) setMessage('Site saved.')
      await loadData()
    } catch (error) {
      console.error('PArAsYtE site save failed:', error)
      if (mountedRef.current) setMessage(safeMessage('save'))
    }
  }

  const removeSite = async (siteId: string) => {
    const client = supabase
    if (!client) return
    try {
      const { error } = await client
        .from('gatehouse_sites')
        .delete()
        .eq('id', siteId)
        .eq('user_id', user.id)
      if (error) throw error
      await loadData()
    } catch (error) {
      console.error('PArAsYtE site remove failed:', error)
      if (mountedRef.current) setMessage(safeMessage('remove'))
    }
  }

  /**
   * Upserts an approval row for the current origin.
   *
   * `allowSameOrigin` defaults to false: approving a brand-new origin (from
   * the "Approve this origin" button on the external-notice screen) only
   * grants the embed gate, nothing more. Passing `true` (from the "Keep me
   * signed in here" button, only ever shown once an origin is already
   * embedded) additionally upgrades that same row to storage-trusted. The
   * two actions are intentionally separate calls to the same upsert so a
   * user can approve an origin for embedding without ever granting it
   * persistent storage access.
   */
  const trustCurrentOrigin = async (allowSameOrigin = false) => {
    const client = supabase
    if (!client) return
    const parsed = safeWebUrl(current)
    if (!parsed) return

    try {
      const { error } = await client
        .from('gatehouse_trusted_origins')
        .upsert(
          { user_id: user.id, origin: parsed.origin, allow_same_origin: allowSameOrigin },
          { onConflict: 'user_id,origin' }
        )
      if (error) throw error
      await loadData()
    } catch (error) {
      console.error('PArAsYtE trust origin failed:', error)
      if (mountedRef.current) setMessage(safeMessage('trust'))
    }
  }

  const untrustOrigin = async (originId: string) => {
    const client = supabase
    if (!client) return
    try {
      const { error } = await client
        .from('gatehouse_trusted_origins')
        .delete()
        .eq('id', originId)
        .eq('user_id', user.id)
      if (error) throw error
      await loadData()
    } catch (error) {
      console.error('PArAsYtE untrust origin failed:', error)
      if (mountedRef.current) setMessage(safeMessage('untrust'))
    }
  }

  const handleWindowControl = async (action: 'minimize' | 'toggle-maximize' | 'close') => {
    if (!window.electronAPI) {
      setMessage('Native window controls are available in the installed PArAsYtE desktop app.')
      return
    }
    try {
      await window.electronAPI.windowControl(action)
    } catch (error) {
      console.error('PArAsYtE window control failed:', error)
      setMessage('That window action could not be completed.')
    }
  }

  const signOut = () => {
    void supabase?.auth.signOut()
  }

  const favorites = useMemo(() => sites.filter(site => site.is_favorite), [sites])
  const currentTrustedOrigin = useMemo(() => {
    const parsed = safeWebUrl(current)
    if (!parsed) return null
    return trustedOrigins.find(origin => origin.origin === parsed.origin) || null
  }, [current, trustedOrigins])

  const securityTitle = currentPolicy.kind === 'home'
    ? 'PArAsYtE home'
    : currentPolicy.kind === 'embed'
      ? (currentPolicy.allowSameOrigin ? 'Approved - remembers its own session' : 'Approved for embedding (sandboxed, no persistent session)')
      : currentPolicy.kind === 'blocked'
        ? 'Blocked destination'
        : currentPolicy.secure
          ? 'Not on your approved list - opens in a separate tab'
          : 'Insecure HTTP - opens in a separate tab'

  return (
    <section className="gatehouseBrowser" data-policy={currentPolicy.kind}>
      <ParasyteScene className="gatehouseBrowserScene" />

      <div className="gatehouseWindow">
        <header className="gatehouseTitlebar">
          <div className="gatehouseWindowDots" aria-label="Window controls">
            <button type="button" className="gatehouseWindowDotClose" onClick={() => void handleWindowControl('close')} title="Close window" aria-label="Close window" />
            <button type="button" className="gatehouseWindowDotMinimize" onClick={() => void handleWindowControl('minimize')} title="Minimize window" aria-label="Minimize window" />
            <button type="button" className="gatehouseWindowDotMaximize" onClick={() => void handleWindowControl('toggle-maximize')} title="Maximize or restore window" aria-label="Maximize or restore window" />
          </div>

          <button type="button" className="gatehouseBrand" onClick={goHome} title="PArAsYtE home">
            <ParasyteMark size={24} />
            <span>
              PArAsYtE
              <span className="gatehouseBrandSuffix"> Browser</span>
            </span>
          </button>

          <div className="gatehouseTabs" aria-label="Browser tab">
            <div className="gatehouseTab gatehouseTabActive">
              {currentPolicy.kind === 'home' ? <Home size={14} /> : <Globe2 size={14} />}
              <span>{currentPolicy.kind === 'home' ? 'New Tab' : currentPolicy.hostname || 'PArAsYtE'}</span>
              <span className={`gatehouseTabTrust ${currentPolicy.kind}`} aria-hidden="true" title={securityTitle} />
            </div>
            <button
              type="button"
              className="gatehouseTab gatehouseTabGhost"
              onClick={() => { addressRef.current?.focus(); addressRef.current?.select() }}
              title="Discover"
            >
              <Compass size={14} />
              <span>Discover</span>
            </button>
            <button
              type="button"
              className="gatehouseTab gatehouseTabGhost gatehouseTabWork"
              onClick={() => setMessage('Your saved work sites are available from Bookmarks.')}
              title="Work"
            >
              <BriefcaseBusiness size={14} />
              <span>Work</span>
            </button>
            <button type="button" className="gatehouseNewTab" onClick={goHome} title="New tab" aria-label="New tab">
              <Plus size={16} />
            </button>
          </div>

          <div className="gatehouseTitleActions">
            <span className="gatehouseAccountPill" title={user.email || 'Signed in'}>
              {profile?.avatar_url
                ? <img className="gatehouseAccountAvatar" src={profile.avatar_url} alt="" />
                : <UserRound size={15} />}
              <span>{user.email || 'Account'}</span>
            </span>
            <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="gatehouseChrome">
          <div className="gatehouseNavButtons">
            <button type="button" disabled={historyIndex <= 0} onClick={goBack} title="Back" aria-label="Back">
              <ArrowLeft size={17} />
            </button>
            <button
              type="button"
              disabled={historyIndex >= history.length - 1}
              onClick={goForward}
              title="Forward"
              aria-label="Forward"
            >
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              disabled={currentPolicy.kind !== 'embed'}
              onClick={() => setReloadKey(v => v + 1)}
              title="Reload"
              aria-label="Reload"
            >
              <RefreshCw size={17} />
            </button>
          </div>

          <div className="gatehouseOmniboxWrap">
            <form className="gatehouseOmnibox" onSubmit={submit}>
              <button
                type="button"
                className={`gatehouseSecurityButton gatehouseSecurityIcon ${currentPolicy.kind}`}
                title={`${securityTitle} · Open PArAsYtE Shields`}
                aria-label="Open PArAsYtE Shields"
                aria-expanded={shieldOpen}
                onClick={() => setShieldOpen(open => !open)}
              >
                {currentPolicy.kind === 'blocked' || !currentPolicy.secure
                  ? <ShieldAlert size={15} />
                  : <ShieldCheck size={15} />}
              </button>
              <input
                ref={addressRef}
                value={address}
                placeholder="Search or enter a URL"
                aria-label="Search or enter a web address"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setAddress(event.target.value)}
              />
              <button type="submit" title="Go" aria-label="Go">
                <Search size={16} />
              </button>
            </form>

            {shieldOpen && (
              <div className="gatehouseShieldPanel" role="dialog" aria-label="PArAsYtE Shields">
                <div className="gatehouseShieldHeader">
                  <span className={`gatehouseShieldBadge ${currentPolicy.kind}`}>
                    {currentPolicy.kind === 'blocked' ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
                  </span>
                  <div>
                    <strong>PArAsYtE Shields</strong>
                    <span>{currentPolicy.kind === 'home' ? 'Private new tab' : currentPolicy.hostname || 'Protected destination'}</span>
                  </div>
                </div>
                <p>{currentPolicy.reason}</p>
                <ul className="gatehouseShieldFacts">
                  <li><ShieldCheck size={13} /> Browsing history stays in memory only.</li>
                  <li><ShieldCheck size={13} /> Pop-ups and parent-tab redirects are blocked.</li>
                  <li><ShieldCheck size={13} /> Camera, microphone, location, payment and device APIs are denied.</li>
                  {currentPolicy.kind === 'embed' && (
                    <li><LockKeyhole size={13} /> {currentPolicy.allowSameOrigin ? 'This approved origin may keep its own signed-in session.' : 'This origin is isolated from persistent site storage.'}</li>
                  )}
                </ul>
                <div className="gatehouseShieldActions">
                  {currentPolicy.kind === 'external' && currentPolicy.secure && (
                    <button type="button" onClick={() => void trustCurrentOrigin()}><Plus size={13} /> Approve origin</button>
                  )}
                  {currentPolicy.kind === 'embed' && !currentPolicy.allowSameOrigin && (
                    <button type="button" onClick={() => void trustCurrentOrigin(true)}><LockKeyhole size={13} /> Remember session</button>
                  )}
                  {currentTrustedOrigin && (
                    <button type="button" className="secondary" onClick={() => void untrustOrigin(currentTrustedOrigin.id)}><Trash2 size={13} /> Remove approval</button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="gatehouseActions">
            <button
              type="button"
              disabled={current === GATEHOUSE_HOME || currentPolicy.kind === 'blocked'}
              onClick={() => void saveSite()}
              title="Save site"
              aria-label="Save current address"
            >
              <Star size={17} />
            </button>
            <button
              type="button"
              disabled={current === GATEHOUSE_HOME || currentPolicy.kind === 'blocked'}
              onClick={openCurrentExternal}
              title="Open in external browser"
              aria-label="Open current address in external browser"
            >
              <ExternalLink size={17} />
            </button>
          </div>
        </div>

        <div className="gatehouseTrustBar" aria-live="polite">
          <span className={`gatehouseTrustDot ${currentPolicy.kind}`} />
          <strong>
            {currentPolicy.kind === 'home' ? 'Protected PArAsYtE session' : currentPolicy.hostname || 'Blocked address'}
          </strong>
          <span>{currentPolicy.reason}</span>
        </div>

        {message && (
          <div className="moduleNotice" role="status">
            <span>{message}</span>
            <button
              type="button"
              className="moduleNoticeDismiss"
              onClick={() => setMessage('')}
              title="Dismiss notification"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="gatehouseBody">
          <aside className="gatehouseSidebar">
            <nav className="gatehouseSideNav" aria-label="PArAsYtE navigation">
              <button type="button" className="gatehouseSideNavItem active" onClick={goHome}>
                <span className="gatehouseSideNavIcon"><Home size={20} /></span>
                <span>Home</span>
              </button>
              <button
                type="button"
                className="gatehouseSideNavItem"
                onClick={() => { addressRef.current?.focus(); addressRef.current?.select() }}
              >
                <span className="gatehouseSideNavIcon"><Compass size={20} /></span>
                <span>Explore</span>
              </button>
              <button
                type="button"
                className="gatehouseSideNavItem"
                onClick={() => setMessage(sites.length ? 'Your saved sites are shown below.' : 'No bookmarks yet. Save a site with the star button.')}
              >
                <span className="gatehouseSideNavIcon"><Bookmark size={19} /></span>
                <span>Bookmarks</span>
              </button>
              <button
                type="button"
                className="gatehouseSideNavItem"
                onClick={() => setMessage('Downloads are handled by your system browser and are not stored by PArAsYtE.')}
              >
                <span className="gatehouseSideNavIcon"><Download size={19} /></span>
                <span>Downloads</span>
              </button>
              <button
                type="button"
                className="gatehouseSideNavItem"
                onClick={() => setSettingsOpen(true)}
              >
                <span className="gatehouseSideNavIcon"><Settings size={19} /></span>
                <span>Settings</span>
              </button>
            </nav>

            <div className="gatehouseSidebarLibrary">
              {favorites.length > 0 && (
                <>
                  <div className="gatehouseSidebarTitle"><Star size={12} /> Favorites</div>
                  {favorites.slice(0, 4).map(site => (
                    <button type="button" key={site.id} title={site.title} onClick={() => navigate(site.url)}>
                      <Globe2 size={14} />
                      <span>{site.title}</span>
                    </button>
                  ))}
                </>
              )}

              {sites.length > 0 && (
                <>
                  <div className="gatehouseSidebarTitle"><Bookmark size={12} /> Saved sites</div>
                  {sites.slice(0, 5).map(site => (
                    <div className="gatehouseSiteRow" key={site.id}>
                      <button type="button" onClick={() => navigate(site.url)}>
                        <Globe2 size={14} />
                        <span>{site.title}</span>
                      </button>
                      <button
                        type="button"
                        className="remove"
                        onClick={() => void removeSite(site.id)}
                        title="Remove site"
                        aria-label={`Remove ${site.title}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {trustedOrigins.length > 0 && (
                <>
                  <div className="gatehouseSidebarTitle"><ShieldCheck size={12} /> Approved</div>
                  {trustedOrigins.slice(0, 3).map(origin => (
                    <div className="gatehouseSiteRow" key={origin.id}>
                      <span className="gatehouseOriginLabel">
                        <LockKeyhole size={12} />
                        {origin.origin}
                        {origin.allow_same_origin && <em title="Also keeps its own session">·session</em>}
                      </span>
                      <button
                        type="button"
                        className="remove"
                        onClick={() => void untrustOrigin(origin.id)}
                        title="Remove this approved origin (it will stop embedding)"
                        aria-label={`Remove ${origin.origin} from approved origins`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="gatehouseSidebarFooter gatehouseSidebarFooterConcept">
              <span>Faster</span>
              <span>Safer</span>
              <span>Together</span>
            </div>
          </aside>

          <main className="gatehouseViewport">
            {currentPolicy.kind === 'home' ? (
              <div
                className="gatehouseHome"
                data-pt-wallpaper={appearance.wallpaper === 'custom' && !profile?.wallpaper_url ? 'default' : appearance.wallpaper}
                style={
                  appearance.wallpaper === 'custom' && profile?.wallpaper_url
                    ? { backgroundImage: `url(${profile.wallpaper_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : undefined
                }
              >
                <ParasyteScene className="gatehouseHomeScene" />
                <div className="gatehouseHomeMotto gatehouseHomeMottoRight" aria-hidden="true">
                  <span>PEOPLE</span>
                  <span>IDEAS</span>
                  <span>A BRIGHTER WEB</span>
                </div>

                <div className="gatehouseHomeHero">
                  <div className="gatehouseHomeLogoHalo">
                    <ParasyteMark size={82} />
                  </div>
                  <h1><strong>PArAsYtE</strong> Browser</h1>
                  <span className="eyebrow">A CLEANER WEB TOGETHER</span>

                  <form className="gatehouseHomeSearch" onSubmit={submit}>
                    <Search size={21} />
                    <input
                      value={address}
                      placeholder="Search the web, privately..."
                      aria-label="Search the web"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setAddress(event.target.value)}
                    />
                    <button type="submit" aria-label="Search">
                      <ArrowRight size={19} />
                    </button>
                  </form>
                </div>

                <div className="gatehouseQuickGrid" aria-label="Quick access">
                  {sites.length > 0 ? sites.slice(0, 5).map(site => (
                    <button type="button" className="gatehouseQuickTile" key={site.id} onClick={() => navigate(site.url)}>
                      <span className="gatehouseQuickIcon"><Globe2 size={22} /></span>
                      <span>{site.title}</span>
                    </button>
                  )) : (
                    <>
                      <button type="button" className="gatehouseQuickTile" onClick={() => navigate('https://www.youtube.com')}>
                        <span className="gatehouseQuickIcon"><Youtube size={22} /></span><span>YouTube</span>
                      </button>
                      <button type="button" className="gatehouseQuickTile" onClick={() => navigate('https://github.com')}>
                        <span className="gatehouseQuickIcon"><Github size={22} /></span><span>GitHub</span>
                      </button>
                      <button type="button" className="gatehouseQuickTile" onClick={() => navigate('https://www.notion.so')}>
                        <span className="gatehouseQuickIcon"><BriefcaseBusiness size={21} /></span><span>Notion</span>
                      </button>
                      <button type="button" className="gatehouseQuickTile gatehouseQuickTileAccent" onClick={() => navigate('https://chatgpt.com')}>
                        <span className="gatehouseQuickIcon"><Sparkles size={22} /></span><span>AI Tools</span>
                      </button>
                      <button type="button" className="gatehouseQuickTile" onClick={() => navigate('https://www.figma.com')}>
                        <span className="gatehouseQuickIcon"><Figma size={22} /></span><span>Figma</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="gatehouseQuickTile gatehouseQuickTileAdd"
                    onClick={() => { addressRef.current?.focus(); addressRef.current?.select() }}
                  >
                    <span className="gatehouseQuickIcon"><Plus size={24} /></span>
                    <span>Add site</span>
                  </button>
                </div>

                <div className="gatehouseHomeFeatureGrid">
                  <article className="gatehouseFeatureCard gatehouseFeatureCardGold">
                    <div className="gatehouseFeatureIcon"><ShieldCheck size={22} /></div>
                    <div>
                      <h2>Approved sites embed. Nothing else does.</h2>
                      <p>Only origins you explicitly approve open inside PArAsYtE's hardened sandbox. Everything else opens in a separate tab.</p>
                    </div>
                    <span className="gatehouseFeatureArrow"><ArrowRight size={18} /></span>
                  </article>

                  <article className="gatehouseFeatureCard gatehouseFeatureCardBlue">
                    <div className="gatehouseFeatureIcon"><Sparkles size={22} /></div>
                    <div>
                      <h2>Make trust yours</h2>
                      <p>Approve exactly which origins may embed here, and separately choose which of those also keep their own session. Your browsing history stays in memory only.</p>
                    </div>
                    <span className="gatehouseFeatureArrow"><ArrowRight size={18} /></span>
                  </article>
                </div>

                <div className="gatehouseHomeFooterMotto" aria-hidden="true">
                  <Compass size={14} />
                  EXPLORE · CREATE · BELONG
                </div>
              </div>
            ) : currentPolicy.kind === 'blocked' ? (
              <div className="gatehouseExternalNotice gatehouseBlockedNotice">
                <div className="gatehouseNoticeIcon"><ShieldAlert size={32} /></div>
                <span className="gatehouseNoticeEyebrow">PArAsYtE SECURITY</span>
                <h3>Navigation blocked</h3>
                <p>{currentPolicy.reason}</p>
                <code>{current}</code>
                <div className="gatehouseExternalActions">
                  <button type="button" className="secondary" onClick={goHome}>
                    <Home size={16} />
                    Return home
                  </button>
                </div>
              </div>
            ) : currentPolicy.kind === 'external' ? (
              <div className="gatehouseExternalNotice">
                <div className="gatehouseNoticeIcon">
                  {currentPolicy.secure ? <ShieldCheck size={32} /> : <ShieldAlert size={32} />}
                </div>
                <span className="gatehouseNoticeEyebrow">
                  {currentPolicy.secure ? 'NOT YET APPROVED' : 'INSECURE DESTINATION'}
                </span>
                <h3>
                  {currentPolicy.secure ? 'Opens in a separate tab' : 'This page cannot be embedded safely'}
                </h3>
                <p>
                  {currentPolicy.secure
                    ? "This origin isn't on your approved list, so PArAsYtE opens it in a separate tab instead of embedding it. Approve it below if you'd like it to open inside the browser from now on."
                    : "This address is plain HTTP, not HTTPS. Modern browsers block insecure content inside an HTTPS app like PArAsYtE, so this can't be embedded no matter what you approve. Open it in a separate tab if you still want to continue."}
                </p>
                <code>{current}</code>
                <div className="gatehouseExternalActions">
                  <button type="button" onClick={openCurrentExternal}>
                    <ExternalLink size={16} />
                    Open in a tab
                  </button>
                  {currentPolicy.secure && (
                    <button type="button" className="secondary" onClick={() => void trustCurrentOrigin()}>
                      <Plus size={16} />
                      Approve this origin
                    </button>
                  )}
                  <button type="button" className="secondary" onClick={goHome}>
                    <Home size={16} />
                    Home
                  </button>
                </div>
                {currentPolicy.secure && (
                  <p className="gatehouseTrustWarning">
                    Only approve origins you control or fully trust. An approved origin runs with
                    scripts enabled inside PArAsYtE. Pop-ups and any attempt to redirect this tab
                    are always blocked, even for origins you approve.
                  </p>
                )}
              </div>
            ) : (
              <div className="gatehouseFrameShell">
                <div className="gatehouseFrameStatus" aria-live="polite">
                  <span className={`gatehouseFrameDot ${frameStatus}`} />
                  <span>
                    {frameStatus === 'loading' && 'Loading securely...'}
                    {frameStatus === 'ready' && (currentPolicy.allowSameOrigin ? 'Loaded · session remembered for this approved origin' : 'Loaded · isolated sandbox')}
                    {frameStatus === 'slow' && 'This site is taking longer than expected'}
                    {frameStatus === 'failed' && 'The embedded site could not be loaded'}
                    {frameStatus === 'idle' && 'Ready'}
                  </span>
                  {(frameStatus === 'slow' || frameStatus === 'failed') && (
                    <button type="button" onClick={() => setReloadKey(v => v + 1)}>
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  )}
                  {!currentPolicy.allowSameOrigin && (
                    <button
                      type="button"
                      onClick={() => void trustCurrentOrigin(true)}
                      title="Only do this for a site you fully trust - it lets that site's scripts read and write its own storage and cookies while embedded."
                    >
                      <Plus size={13} />
                      Keep me signed in here
                    </button>
                  )}
                  <button type="button" onClick={openCurrentExternal}>
                    <ExternalLink size={13} />
                    Open outside
                  </button>
                </div>
                {/*
                  Security boundary: keep the sandbox deliberately minimal.
                  Do not add allow-popups or top-navigation flags here; approved
                  origins may only gain allow-same-origin for their own session.
                */}
                <iframe
                  key={`${current}-${reloadKey}`}
                  title="PArAsYtE browser view"
                  src={current}
                  referrerPolicy="no-referrer"
                  sandbox={
                    currentPolicy.allowSameOrigin
                      ? 'allow-forms allow-scripts allow-same-origin'
                      : 'allow-forms allow-scripts'
                  }
                  allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; serial 'none'; hid 'none'; clipboard-read 'none'; clipboard-write 'none'"
                  onLoad={() => setFrameStatus('ready')}
                  onError={() => setFrameStatus('failed')}
                />
                {(frameStatus === 'slow' || frameStatus === 'failed') && (
                  <div className="gatehouseFrameFallback">
                    If the page is blank, its server may refuse to be framed using
                    X-Frame-Options or frame-ancestors. PArAsYtE cannot override a
                    destination's server-side security policy; open it outside instead.
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {settingsOpen && (
          <SettingsPanel
            user={user}
            appearance={appearance}
            profile={profile}
            trustedOrigins={trustedOrigins}
            onUntrustOrigin={(originId) => void untrustOrigin(originId)}
            onAppearanceChange={setAppearance}
            onProfileChange={setProfile}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </section>
  )
}
