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
  ExternalLink,
  Globe2,
  Home,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import ParasyteMark from '../components/ParasyteMark'
import { supabase } from '../lib/supabase'
import {
  GATEHOUSE_HOME,
  buildStorageTrustedOrigins,
  classifyGatehouseTarget,
  resolveGatehouseInput,
  safeWebUrl
} from '../lib/policy'
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
      return 'Unable to trust this origin. Please try again.'
    case 'untrust':
      return 'Unable to remove this trusted origin. Please try again.'
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
  const addressRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)

  // In-memory only, by design: `history` (the back/forward stack, above) and
  // everything else on this page except `sites` and `trustedOrigins` lives in
  // React state and nowhere else. Nothing here ever touches localStorage,
  // sessionStorage, or a cookie. Closing the tab or reloading wipes it -
  // that's the whole "acts like incognito unless you save it" promise. The
  // only durable state a user has is what they explicitly starred (`sites`)
  // or explicitly trusted (`trustedOrigins`), both one row per user in
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

  const storageTrustedOrigins = useMemo(
    () => buildStorageTrustedOrigins(
      trustedOrigins.filter(o => o.allow_same_origin).map(o => o.origin)
    ),
    [trustedOrigins]
  )

  const currentPolicy = useMemo(
    () => classifyGatehouseTarget(current, { storageTrustedOrigins }),
    [current, storageTrustedOrigins]
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

  const navigate = useCallback((value: string, push = true) => {
    const resolved = value === GATEHOUSE_HOME ? GATEHOUSE_HOME : resolveGatehouseInput(value)

    setCurrent(resolved)
    setAddress(displayAddress(resolved))
    setMessage('')

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

  const trustCurrentOrigin = async () => {
    const client = supabase
    if (!client) return
    const parsed = safeWebUrl(current)
    if (!parsed) return

    try {
      const { error } = await client
        .from('gatehouse_trusted_origins')
        .upsert(
          { user_id: user.id, origin: parsed.origin, allow_same_origin: true },
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

  const signOut = () => {
    void supabase?.auth.signOut()
  }

  const favorites = useMemo(() => sites.filter(site => site.is_favorite), [sites])

  const securityTitle = currentPolicy.kind === 'home'
    ? 'PArAsYtE home'
    : currentPolicy.kind === 'embed'
      ? (currentPolicy.allowSameOrigin ? 'Embedded - remembers its own session' : 'Embedded, sandboxed (no persistent session)')
      : currentPolicy.kind === 'blocked'
        ? 'Blocked destination'
        : 'Insecure HTTP - opens in a separate tab'

  return (
    <section className="gatehouseBrowser" data-policy={currentPolicy.kind}>
      <div className="gatehouseChrome">
        <div className="gatehouseBrand">
          <ParasyteMark size={20} />
          <span>
            PArAsYtE
            <span className="gatehouseBrandSuffix"> Browser</span>
          </span>
        </div>

        <div className="gatehouseNavButtons">
          <button type="button" disabled={historyIndex <= 0} onClick={goBack} title="Back" aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            disabled={historyIndex >= history.length - 1}
            onClick={goForward}
            title="Forward"
            aria-label="Forward"
          >
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            disabled={currentPolicy.kind !== 'embed'}
            onClick={() => setReloadKey(v => v + 1)}
            title="Reload"
            aria-label="Reload"
          >
            <RefreshCw size={16} />
          </button>
          <button type="button" onClick={goHome} title="Home" aria-label="Home">
            <Home size={16} />
          </button>
        </div>

        <form className="gatehouseOmnibox" onSubmit={submit}>
          <span className={`gatehouseSecurityIcon ${currentPolicy.kind}`} title={securityTitle}>
            {currentPolicy.kind === 'blocked' || !currentPolicy.secure
              ? <ShieldAlert size={15} />
              : <ShieldCheck size={15} />}
          </span>
          <input
            ref={addressRef}
            value={address}
            placeholder="Search the web or enter a web address"
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

        <div className="gatehouseActions">
          <button
            type="button"
            disabled={current === GATEHOUSE_HOME || currentPolicy.kind === 'blocked'}
            onClick={() => void saveSite()}
            title="Save site"
            aria-label="Save current address"
          >
            <Star size={16} />
          </button>
          <button
            type="button"
            disabled={current === GATEHOUSE_HOME || currentPolicy.kind === 'blocked'}
            onClick={openCurrentExternal}
            title="Open in external browser"
            aria-label="Open current address in external browser"
          >
            <ExternalLink size={16} />
          </button>
          <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="gatehouseTrustBar" aria-live="polite">
        <span className={`gatehouseTrustDot ${currentPolicy.kind}`} />
        <strong>
          {currentPolicy.kind === 'home' ? 'PArAsYtE' : currentPolicy.hostname || 'Blocked address'}
        </strong>
        <span>{currentPolicy.reason}</span>
      </div>

      {message && <div className="moduleNotice" role="status">{message}</div>}

      <div className="gatehouseBody">
        <aside className="gatehouseSidebar">
          {favorites.length > 0 && (
            <>
              <div className="gatehouseSidebarTitle">Favorites</div>
              {favorites.map(site => (
                <button type="button" key={site.id} title={site.title} onClick={() => navigate(site.url)}>
                  <Globe2 size={14} />
                  <span>{site.title}</span>
                </button>
              ))}
            </>
          )}

          <div className="gatehouseSidebarTitle">My sites</div>
          {sites.map(site => (
            <div className="gatehouseSiteRow" key={site.id}>
              <button type="button" onClick={() => navigate(site.url)}>
                <Star size={13} />
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
          {sites.length === 0 && <span className="gatehouseEmpty">No saved sites yet.</span>}

          {trustedOrigins.length > 0 && (
            <>
              <div className="gatehouseSidebarTitle">Keeps its own session</div>
              {trustedOrigins.map(origin => (
                <div className="gatehouseSiteRow" key={origin.id}>
                  <span className="gatehouseOriginLabel">{origin.origin}</span>
                  <button
                    type="button"
                    className="remove"
                    onClick={() => void untrustOrigin(origin.id)}
                    title="Stop remembering this origin's session"
                    aria-label={`Stop remembering ${origin.origin}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </>
          )}
        </aside>

        <main className="gatehouseViewport">
          {currentPolicy.kind === 'home' ? (
            <div className="gatehouseHome">
              <ParasyteMark size={48} />
              <span className="eyebrow">A CLEANER WEB, TOGETHER</span>
              <h2>Open what you trust. Nothing else gets in, and nothing sticks around.</h2>
              <p>
                Type an address and it opens right here, sandboxed, whatever it is -
                there's no separate "allowed to embed" list gating that. The only
                thing trusting an origin does is let it keep its own session between
                visits; that's optional and off by default. History, pop-ups, and
                redirects out of this tab are blocked regardless, and nothing is
                remembered between visits unless you explicitly save it.
              </p>

              <form className="gatehouseHomeSearch" onSubmit={submit}>
                <Search size={20} />
                <input
                  value={address}
                  placeholder="Search the web"
                  aria-label="Search the web"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setAddress(event.target.value)}
                />
                <button type="submit">Search</button>
              </form>

              <div className="gatehouseHomeLinks">
                {sites.slice(0, 8).map(site => (
                  <button type="button" key={site.id} onClick={() => navigate(site.url)}>
                    <Globe2 size={17} />
                    <span>{site.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : currentPolicy.kind === 'blocked' ? (
            <div className="gatehouseExternalNotice gatehouseBlockedNotice">
              <ShieldAlert size={30} />
              <h3>Navigation blocked</h3>
              <p>{currentPolicy.reason}</p>
              <code>{current}</code>
              <button type="button" onClick={goHome}>
                <Home size={16} />
                Return home
              </button>
            </div>
          ) : currentPolicy.kind === 'external' ? (
            <div className="gatehouseExternalNotice">
              <ShieldAlert size={30} />
              <h3>Can't embed insecure pages</h3>
              <p>
                This address is plain HTTP, not HTTPS. Browsers block insecure
                content inside an HTTPS app like PArAsYtE outright (mixed-content
                blocking) - there's no way around that from here.
              </p>
              <code>{current}</code>
              <div className="gatehouseExternalActions">
                <button type="button" onClick={openCurrentExternal}>
                  <ExternalLink size={16} />
                  Open in a tab
                </button>
                <button type="button" className="secondary" onClick={goHome}>
                  <Home size={16} />
                  Home
                </button>
              </div>
            </div>
          ) : (
            <div className="gatehouseFrameShell">
              <div className="gatehouseFrameStatus" aria-live="polite">
                <span className={`gatehouseFrameDot ${frameStatus}`} />
                <span>
                  {frameStatus === 'loading' && 'Loading...'}
                  {frameStatus === 'ready' && (currentPolicy.allowSameOrigin ? 'Loaded - session remembered here' : 'Loaded (sandboxed)')}
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
                    onClick={() => void trustCurrentOrigin()}
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
                Sandbox flags, deliberately minimal:
                - allow-forms, allow-scripts: the origin needs these to function.
                - allow-same-origin: only ever added when currentPolicy.allowSameOrigin
                  is true, i.e. the user explicitly opted this origin into storage
                  trust (see policy.ts). Never granted by default, and unrelated to
                  whether the origin gets embedded at all - every secure, non-private
                  destination embeds regardless of this flag.
                - allow-popups is intentionally NEVER included. Without it, an
                  embedded page's window.open() and target="_blank" links are
                  silently blocked - no popups, full stop, even for trusted origins.
                  Trade-off worth knowing: some sites' "Sign in with Google/Microsoft"
                  flows use a popup and will not work here. If that ever needs to
                  change, it should be a per-origin opt-in, not a global default.
                - allow-top-navigation / allow-top-navigation-by-user-activation are
                  also intentionally NEVER included. Without them, nothing an
                  embedded page runs can redirect this tab or navigate the parent
                  frame - that's what keeps everything embedded staying embedded,
                  even now that embedding itself is no longer gated by trust.
                  Do not add either flag; that reopens the exact redirect/breakout
                  surface this app exists to close.
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
                  If the page is blank, its server may still refuse to be framed at
                  all (X-Frame-Options / frame-ancestors) - that's the site's own
                  server-side decision and nothing on this end can override it.
                  Open it outside PArAsYtE instead.
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </section>
  )
}
