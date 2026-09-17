import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Compass,
  Download,
  ExternalLink,
  Figma,
  FolderOpen,
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

type BrowserTab = {
  id: string
  current: string
  address: string
  title: string
  history: string[]
  historyIndex: number
  reloadKey: number
  frameStatus: FrameStatus
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
  favicon: string | null
}

type InternalPanel = 'bookmarks' | 'downloads' | null

type NativeDownload = {
  id: string
  filename: string
  url: string
  receivedBytes: number
  totalBytes: number
  state: string
  savePath: string | null
  startedAt: number
}

const MAX_HISTORY = 80
const MAX_TABS = 20
const FRAME_SLOW_MS = 7000
const FRAME_HARD_FAIL_MS = 20000

const TOP_LEVEL_ONLY_HOSTS = [
  'youtube.com',
  'youtu.be',
  'github.com',
  'figma.com',
  'notion.so',
  'chatgpt.com'
]

function displayAddress(value: string): string {
  return value === GATEHOUSE_HOME ? '' : value
}

function hostnameTitle(value: string): string {
  if (value === GATEHOUSE_HOME) return 'New Tab'
  return safeWebUrl(value)?.hostname.replace(/^www\./, '') || 'PArAsYtE'
}

function newTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createTab(value = GATEHOUSE_HOME): BrowserTab {
  return {
    id: newTabId(),
    current: value,
    address: displayAddress(value),
    title: hostnameTitle(value),
    history: [value],
    historyIndex: 0,
    reloadKey: 0,
    frameStatus: 'idle',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: null,
    favicon: null
  }
}

function safeMessage(action: 'load' | 'save' | 'remove' | 'trust' | 'untrust' | 'favorite'): string {
  switch (action) {
    case 'save':
      return 'Unable to save this bookmark. Please try again.'
    case 'remove':
      return 'Unable to remove this bookmark. Please try again.'
    case 'favorite':
      return 'Unable to update that favorite. Please try again.'
    case 'trust':
      return 'Unable to approve this origin. Please try again.'
    case 'untrust':
      return 'Unable to remove this approved origin. Please try again.'
    default:
      return 'Unable to load your PArAsYtE data. Please refresh or sign in again.'
  }
}

function needsTopLevelContext(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  return TOP_LEVEL_ONLY_HOSTS.some(candidate => host === candidate || host.endsWith(`.${candidate}`))
}

function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

export default function GatehouseBrowser({ user }: { user: User }) {
  const initialTabRef = useRef<BrowserTab | null>(null)
  if (!initialTabRef.current) initialTabRef.current = createTab()

  const [tabs, setTabs] = useState<BrowserTab[]>(() => [initialTabRef.current as BrowserTab])
  const [activeTabId, setActiveTabId] = useState(() => (initialTabRef.current as BrowserTab).id)
  const [sites, setSites] = useState<Site[]>([])
  const [trustedOrigins, setTrustedOrigins] = useState<TrustedOrigin[]>([])
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<GatehouseProfile | null>(null)
  const [appearance, setAppearance] = useState<AppearancePreferences>(() => readAppearance())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shieldOpen, setShieldOpen] = useState(false)
  const [internalPanel, setInternalPanel] = useState<InternalPanel>(null)
  const [downloads, setDownloads] = useState<NativeDownload[]>([])
  const addressRef = useRef<HTMLInputElement>(null)
  const homeSearchRef = useRef<HTMLInputElement>(null)
  const nativeSurfaceRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const tabsRef = useRef(tabs)
  const recentlyClosedRef = useRef<string[]>([])

  const electron = typeof window !== 'undefined' ? window.electronAPI : undefined
  const isDesktop = Boolean(electron?.isElectron)

  const activeTab = useMemo(
    () => tabs.find(tab => tab.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  )
  const current = activeTab?.current || GATEHOUSE_HOME
  const address = activeTab?.address || ''

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const api = window.electronAPI
      if (api) {
        for (const tab of tabsRef.current) void api.browserClose(tab.id)
      }
    }
  }, [])

  const embedOrigins = useMemo(
    () => buildEmbedOrigins(
      trustedOrigins.map(origin => origin.origin),
      typeof window === 'undefined' ? undefined : window.location.origin
    ),
    [trustedOrigins]
  )
  const storageTrustedOrigins = useMemo(
    () => buildStorageTrustedOrigins(
      trustedOrigins.filter(origin => origin.allow_same_origin).map(origin => origin.origin)
    ),
    [trustedOrigins]
  )

  const currentPolicy = useMemo(
    () => classifyGatehouseTarget(current, { embedOrigins, storageTrustedOrigins }),
    [current, embedOrigins, storageTrustedOrigins]
  )

  // Desktop uses a real top-level WebContentsView for every public HTTP(S)
  // destination. The web build retains the iframe/external fallback because a
  // normal web page cannot override another site's anti-framing policy.
  const useNativeSurface = Boolean(
    isDesktop &&
    current !== GATEHOUSE_HOME &&
    currentPolicy.kind !== 'blocked' &&
    safeWebUrl(current)
  )

  const webNeedsTopLevel = Boolean(
    !isDesktop &&
    currentPolicy.kind === 'embed' &&
    needsTopLevelContext(currentPolicy.hostname)
  )

  const loadData = useCallback(async () => {
    const client = supabase
    if (!client) return

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

      if (sitesResult.error) throw sitesResult.error
      if (originsResult.error) throw originsResult.error
      if (!mountedRef.current) return

      setSites((sitesResult.data || []) as Site[])
      setTrustedOrigins((originsResult.data || []) as TrustedOrigin[])
    } catch (error) {
      console.error('PArAsYtE data load failed:', error)
      if (mountedRef.current) setMessage(safeMessage('load'))
    }
  }, [user.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

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

  useEffect(() => {
    void window.electronAPI?.setBrowserSize?.(appearance.size)
  }, [appearance.size])

  const updateTab = useCallback((tabId: string, update: (tab: BrowserTab) => BrowserTab) => {
    setTabs(previous => previous.map(tab => tab.id === tabId ? update(tab) : tab))
  }, [])

  const setActiveAddress = useCallback((value: string) => {
    updateTab(activeTabId, tab => ({ ...tab, address: value }))
  }, [activeTabId, updateTab])

  const classifyForNavigation = useCallback((value: string) => (
    classifyGatehouseTarget(value, { embedOrigins, storageTrustedOrigins })
  ), [embedOrigins, storageTrustedOrigins])

  const navigateTab = useCallback((tabId: string, value: string, push = true) => {
    const resolved = value === GATEHOUSE_HOME ? GATEHOUSE_HOME : resolveGatehouseInput(value)
    const immediateTitle = hostnameTitle(resolved)

    updateTab(tabId, tab => {
      let history = tab.history
      let historyIndex = tab.historyIndex
      if (push && tab.history[tab.historyIndex] !== resolved) {
        const base = tab.history.slice(0, tab.historyIndex + 1)
        const appended = [...base, resolved].slice(-MAX_HISTORY)
        history = appended
        historyIndex = appended.length - 1
      }
      return {
        ...tab,
        current: resolved,
        address: displayAddress(resolved),
        title: immediateTitle,
        history,
        historyIndex,
        frameStatus: resolved === GATEHOUSE_HOME ? 'idle' : 'loading',
        loading: resolved !== GATEHOUSE_HOME,
        error: null
      }
    })

    setInternalPanel(null)
    setMessage('')
    setShieldOpen(false)

    const api = window.electronAPI
    const parsed = safeWebUrl(resolved)
    const policy = classifyForNavigation(resolved)
    if (api && parsed && policy.kind !== 'blocked') {
      void api.browserNavigate(tabId, parsed.toString()).then(result => {
        if (!result.ok && mountedRef.current) {
          updateTab(tabId, tab => ({ ...tab, loading: false, frameStatus: 'failed', error: result.error || 'Navigation failed.' }))
        }
      })
    } else if (api && resolved === GATEHOUSE_HOME) {
      void api.browserHide()
    }
  }, [classifyForNavigation, updateTab])

  const navigate = useCallback((value: string, push = true) => {
    navigateTab(activeTabId, value, push)
  }, [activeTabId, navigateTab])

  const openNewTab = useCallback((value = GATEHOUSE_HOME) => {
    if (tabsRef.current.length >= MAX_TABS) {
      setMessage(`PArAsYtE currently supports up to ${MAX_TABS} open tabs. Close one before opening another.`)
      return
    }

    const resolved = value === GATEHOUSE_HOME ? GATEHOUSE_HOME : resolveGatehouseInput(value)
    const tab = createTab(resolved)
    setTabs(previous => [...previous, tab])
    setActiveTabId(tab.id)
    setInternalPanel(null)
    setShieldOpen(false)
    setMessage('')

    const parsed = safeWebUrl(resolved)
    const policy = classifyForNavigation(resolved)
    const api = window.electronAPI
    if (api && parsed && policy.kind !== 'blocked') {
      void api.browserNavigate(tab.id, parsed.toString())
    }
  }, [classifyForNavigation])

  const closeTab = useCallback((tabId: string) => {
    const currentTabs = tabsRef.current
    const closingTab = currentTabs.find(tab => tab.id === tabId)
    if (closingTab && closingTab.current !== GATEHOUSE_HOME) {
      recentlyClosedRef.current = [closingTab.current, ...recentlyClosedRef.current].slice(0, 12)
    }
    if (currentTabs.length === 1) {
      const onlyTab = currentTabs[0]
      void window.electronAPI?.browserClose(onlyTab.id)
      const replacement = createTab()
      setTabs([replacement])
      setActiveTabId(replacement.id)
      setInternalPanel(null)
      return
    }

    const closingIndex = currentTabs.findIndex(tab => tab.id === tabId)
    const wasActive = tabId === activeTabId
    void window.electronAPI?.browserClose(tabId)
    const nextTabs = currentTabs.filter(tab => tab.id !== tabId)
    setTabs(nextTabs)
    if (wasActive) {
      const nextIndex = Math.max(0, Math.min(closingIndex, nextTabs.length - 1))
      setActiveTabId(nextTabs[nextIndex].id)
      setInternalPanel(null)
    }
  }, [activeTabId])

  const reopenClosedTab = useCallback(() => {
    const url = recentlyClosedRef.current.shift()
    if (url) openNewTab(url)
  }, [openNewTab])

  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
    setInternalPanel(null)
    setShieldOpen(false)
    setMessage('')
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const removeState = api.onBrowserTabState(state => {
      updateTab(state.id, tab => {
        const nextUrl = state.url && safeWebUrl(state.url) ? state.url : tab.current
        return {
          ...tab,
          current: nextUrl,
          address: displayAddress(nextUrl),
          title: state.title?.trim() || hostnameTitle(nextUrl),
          loading: state.loading ?? tab.loading,
          canGoBack: state.canGoBack ?? tab.canGoBack,
          canGoForward: state.canGoForward ?? tab.canGoForward,
          error: state.error === undefined ? tab.error : state.error,
          favicon: state.favicon === undefined ? tab.favicon : state.favicon,
          frameStatus: state.error
            ? 'failed'
            : state.loading
              ? 'loading'
              : nextUrl === GATEHOUSE_HOME
                ? 'idle'
                : 'ready'
        }
      })
    })

    const removeCommand = api.onBrowserCommand(command => {
      if (command.command === 'focus-location') {
        addressRef.current?.focus()
        addressRef.current?.select()
      } else if (command.command === 'new-tab') {
        openNewTab(command.url || GATEHOUSE_HOME)
      } else if (command.command === 'reopen-closed-tab') {
        reopenClosedTab()
      } else if (command.command === 'close-active-tab') {
        const active = tabsRef.current.find(tab => tab.id === activeTabId)
        if (active) closeTab(active.id)
      }
    })

    void api.listDownloads().then(items => {
      if (mountedRef.current) setDownloads(items)
    })
    const removeDownload = api.onDownloadUpdated(download => {
      setDownloads(previous => {
        const next = previous.filter(item => item.id !== download.id)
        return [download, ...next].sort((a, b) => b.startedAt - a.startedAt)
      })
    })

    return () => {
      removeState()
      removeCommand()
      removeDownload()
    }
  }, [activeTabId, closeTab, openNewTab, reopenClosedTab, updateTab])

  // Resize/position the native browsing surface so it exactly covers the DOM
  // placeholder inside the app chrome. Hiding it before Settings/internal
  // panels prevents native content from floating above React overlays.
  useLayoutEffect(() => {
    const api = window.electronAPI
    const element = nativeSurfaceRef.current
    if (!api || !useNativeSurface || !element || settingsOpen || internalPanel) {
      void api?.browserHide()
      return
    }

    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return
        const bounds = {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
        void api.browserShow(activeTab.id, bounds)
        void api.browserSetBounds(activeTab.id, bounds)
      })
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    window.addEventListener('resize', sync)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', sync)
      void api.browserHide()
    }
  }, [activeTab.id, appearance.sidebar, appearance.size, internalPanel, settingsOpen, useNativeSurface])

  useEffect(() => {
    if (useNativeSurface || currentPolicy.kind !== 'embed' || webNeedsTopLevel) return

    updateTab(activeTab.id, tab => ({ ...tab, frameStatus: 'loading' }))
    const slowTimeout = window.setTimeout(() => {
      updateTab(activeTab.id, tab => tab.frameStatus === 'loading' ? { ...tab, frameStatus: 'slow' } : tab)
    }, FRAME_SLOW_MS)
    const hardFailTimeout = window.setTimeout(() => {
      updateTab(activeTab.id, tab => (tab.frameStatus === 'loading' || tab.frameStatus === 'slow') ? { ...tab, frameStatus: 'failed' } : tab)
    }, FRAME_HARD_FAIL_MS)

    return () => {
      window.clearTimeout(slowTimeout)
      window.clearTimeout(hardFailTimeout)
    }
  }, [activeTab.id, activeTab.reloadKey, current, currentPolicy.kind, updateTab, useNativeSurface, webNeedsTopLevel])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (modifier && key === 'l') {
        event.preventDefault()
        addressRef.current?.focus()
        addressRef.current?.select()
        return
      }
      if (modifier && event.shiftKey && key === 't') {
        event.preventDefault()
        reopenClosedTab()
        return
      }
      if (modifier && key === 't') {
        event.preventDefault()
        openNewTab()
        return
      }
      if (modifier && key === 'w') {
        event.preventDefault()
        closeTab(activeTabId)
        return
      }
      if (modifier && event.key === 'Tab') {
        event.preventDefault()
        const index = tabsRef.current.findIndex(tab => tab.id === activeTabId)
        const offset = event.shiftKey ? -1 : 1
        const next = (index + offset + tabsRef.current.length) % tabsRef.current.length
        activateTab(tabsRef.current[next].id)
        return
      }
      if (event.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else if (shieldOpen) setShieldOpen(false)
        else if (internalPanel) setInternalPanel(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activateTab, activeTabId, closeTab, internalPanel, openNewTab, reopenClosedTab, settingsOpen, shieldOpen])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    navigate(address)
  }

  const submitHome = (event: FormEvent) => {
    event.preventDefault()
    navigate(address)
  }

  const goBack = () => {
    if (useNativeSurface) {
      void electron?.browserCommand(activeTab.id, 'back')
      return
    }
    if (activeTab.historyIndex <= 0) return
    const nextIndex = activeTab.historyIndex - 1
    const nextUrl = activeTab.history[nextIndex]
    updateTab(activeTab.id, tab => ({
      ...tab,
      historyIndex: nextIndex,
      current: nextUrl,
      address: displayAddress(nextUrl),
      title: hostnameTitle(nextUrl)
    }))
  }

  const goForward = () => {
    if (useNativeSurface) {
      void electron?.browserCommand(activeTab.id, 'forward')
      return
    }
    if (activeTab.historyIndex >= activeTab.history.length - 1) return
    const nextIndex = activeTab.historyIndex + 1
    const nextUrl = activeTab.history[nextIndex]
    updateTab(activeTab.id, tab => ({
      ...tab,
      historyIndex: nextIndex,
      current: nextUrl,
      address: displayAddress(nextUrl),
      title: hostnameTitle(nextUrl)
    }))
  }

  const reload = () => {
    if (useNativeSurface) {
      void electron?.browserCommand(activeTab.id, activeTab.loading ? 'stop' : 'reload')
      return
    }
    updateTab(activeTab.id, tab => ({ ...tab, reloadKey: tab.reloadKey + 1 }))
  }

  const goHome = () => navigate(GATEHOUSE_HOME)

  const openCurrentExternal = () => {
    if (current === GATEHOUSE_HOME) return
    const parsed = safeWebUrl(current)
    if (!parsed) return
    if (window.electronAPI) {
      void window.electronAPI.openExternal(parsed.toString())
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
          { user_id: user.id, title: activeTab.title || parsed.hostname, url: parsed.toString() },
          { onConflict: 'user_id,url' }
        )
      if (error) throw error
      if (mountedRef.current) setMessage('Bookmark saved.')
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

  const toggleFavorite = async (site: Site) => {
    const client = supabase
    if (!client) return
    try {
      const { error } = await client
        .from('gatehouse_sites')
        .update({ is_favorite: !site.is_favorite })
        .eq('id', site.id)
        .eq('user_id', user.id)
      if (error) throw error
      await loadData()
    } catch (error) {
      console.error('PArAsYtE favorite update failed:', error)
      if (mountedRef.current) setMessage(safeMessage('favorite'))
    }
  }

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

  const signOut = () => {
    void supabase?.auth.signOut()
  }

  const favorites = useMemo(() => sites.filter(site => site.is_favorite), [sites])
  const currentSavedSite = useMemo(() => sites.find(site => site.url === current) || null, [current, sites])
  const currentTrustedOrigin = useMemo(() => {
    const parsed = safeWebUrl(current)
    if (!parsed) return null
    return trustedOrigins.find(origin => origin.origin === parsed.origin) || null
  }, [current, trustedOrigins])

  const backDisabled = useNativeSurface ? !activeTab.canGoBack : activeTab.historyIndex <= 0
  const forwardDisabled = useNativeSurface ? !activeTab.canGoForward : activeTab.historyIndex >= activeTab.history.length - 1

  const securityTitle = currentPolicy.kind === 'home'
    ? 'PArAsYtE home'
    : currentPolicy.kind === 'blocked'
      ? 'Blocked destination'
      : useNativeSurface
        ? (currentPolicy.secure ? 'Protected native tab' : 'Not secure - HTTP')
        : currentPolicy.kind === 'embed'
          ? (currentPolicy.allowSameOrigin ? 'Approved - remembers its own session' : 'Approved for sandboxed embedding')
          : currentPolicy.secure
            ? 'Opens outside this web build'
            : 'Insecure HTTP'

  const trustReason = currentPolicy.kind === 'home'
    ? 'Private new tab'
    : currentPolicy.kind === 'blocked'
      ? currentPolicy.reason
      : useNativeSurface
        ? (currentPolicy.secure
            ? 'Loaded as a top-level site in PArAsYtE’s isolated desktop browser session.'
            : 'This page uses HTTP, so the connection itself is not encrypted.')
        : currentPolicy.reason

  const renderInternalPanel = () => {
    if (internalPanel === 'bookmarks') {
      return (
        <div className="gatehouseInternalPage">
          <header className="gatehouseInternalHeader">
            <div className="gatehouseInternalIcon"><Bookmark size={22} /></div>
            <div><span>LIBRARY</span><h2>Bookmarks</h2><p>Your saved sites, available anywhere you sign in.</p></div>
          </header>
          {sites.length === 0 ? (
            <div className="gatehouseInternalEmpty">
              <Bookmark size={34} />
              <h3>No bookmarks yet</h3>
              <p>Open a site and click the star in the address bar to save it.</p>
            </div>
          ) : (
            <div className="gatehouseBookmarkGrid">
              {sites.map(site => (
                <article className="gatehouseBookmarkCard" key={site.id}>
                  <button className="gatehouseBookmarkOpen" type="button" onClick={() => navigate(site.url)}>
                    <span className="gatehouseBookmarkFavicon"><Globe2 size={19} /></span>
                    <span><strong>{site.title}</strong><small>{site.url}</small></span>
                  </button>
                  <div className="gatehouseBookmarkActions">
                    <button type="button" className={site.is_favorite ? 'active' : ''} onClick={() => void toggleFavorite(site)} title={site.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>
                      <Star size={15} fill={site.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button type="button" onClick={() => void removeSite(site.id)} title="Delete bookmark"><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (internalPanel === 'downloads') {
      return (
        <div className="gatehouseInternalPage">
          <header className="gatehouseInternalHeader">
            <div className="gatehouseInternalIcon"><Download size={22} /></div>
            <div><span>ACTIVITY</span><h2>Downloads</h2><p>{isDesktop ? 'Downloads started inside PArAsYtE desktop.' : 'The web build delegates downloads to your host browser.'}</p></div>
          </header>
          {!isDesktop ? (
            <div className="gatehouseInternalEmpty">
              <ExternalLink size={34} />
              <h3>Managed by your browser</h3>
              <p>Install the PArAsYtE desktop app for an integrated download list.</p>
            </div>
          ) : downloads.length === 0 ? (
            <div className="gatehouseInternalEmpty">
              <Download size={34} />
              <h3>No downloads yet</h3>
              <p>Files downloaded from native PArAsYtE tabs will appear here.</p>
            </div>
          ) : (
            <div className="gatehouseDownloadList">
              {downloads.map(download => {
                const progress = download.totalBytes > 0 ? Math.min(100, Math.round(download.receivedBytes / download.totalBytes * 100)) : 0
                const completed = download.state === 'completed'
                return (
                  <article className="gatehouseDownloadRow" key={download.id}>
                    <span className={`gatehouseDownloadStatus ${download.state}`}>
                      {completed ? <CheckCircle2 size={19} /> : <Download size={19} />}
                    </span>
                    <div className="gatehouseDownloadMeta">
                      <strong>{download.filename}</strong>
                      <small>{completed ? humanBytes(download.receivedBytes) : `${progress}% · ${humanBytes(download.receivedBytes)} of ${humanBytes(download.totalBytes)}`}</small>
                      {!completed && <span className="gatehouseDownloadProgress"><i style={{ width: `${progress}%` }} /></span>}
                    </div>
                    {completed && download.savePath && (
                      <div className="gatehouseDownloadActions">
                        <button type="button" onClick={() => void electron?.openDownload(download.savePath as string)}>Open</button>
                        <button type="button" onClick={() => void electron?.showDownloadInFolder(download.savePath as string)}><FolderOpen size={14} /> Show</button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <section className="gatehouseBrowser" data-policy={currentPolicy.kind} data-desktop={isDesktop ? 'true' : 'false'}>
      <ParasyteScene className="gatehouseBrowserScene" />

      <div className="gatehouseWindow">
        <header className="gatehouseTitlebar">
          <button type="button" className="gatehouseBrand" onClick={goHome} title="PArAsYtE home">
            <ParasyteMark size={24} />
            <span>PArAsYtE<span className="gatehouseBrandSuffix"> Browser</span></span>
          </button>

          <div className="gatehouseTabs" aria-label="Browser tabs">
            {tabs.map(tab => (
              <div className={`gatehouseTabWrap ${tab.id === activeTabId ? 'active' : ''}`} key={tab.id}>
                <button type="button" className={`gatehouseTab ${tab.id === activeTabId ? 'gatehouseTabActive' : ''}`} onClick={() => activateTab(tab.id)} title={tab.title}>
                  {tab.favicon ? <img className="gatehouseTabFavicon" src={tab.favicon} alt="" /> : tab.current === GATEHOUSE_HOME ? <Home size={14} /> : <Globe2 size={14} />}
                  <span>{tab.title}</span>
                  {tab.loading ? <span className="gatehouseTabSpinner" aria-hidden="true" /> : <span className={`gatehouseTabTrust ${tab.error ? 'blocked' : tab.current === GATEHOUSE_HOME ? 'home' : 'embed'}`} aria-hidden="true" />}
                </button>
                <button type="button" className="gatehouseTabClose" onClick={() => closeTab(tab.id)} title="Close tab" aria-label={`Close ${tab.title}`}><X size={13} /></button>
              </div>
            ))}
            <button type="button" className="gatehouseNewTab" onClick={() => openNewTab()} title="New tab (⌘/Ctrl+T)" aria-label="New tab"><Plus size={16} /></button>
          </div>

          <div className="gatehouseTitleActions">
            <span className="gatehouseAccountPill" title={user.email || 'Signed in'}>
              {profile?.avatar_url ? <img className="gatehouseAccountAvatar" src={profile.avatar_url} alt="" /> : <UserRound size={15} />}
              <span>{user.email || 'Account'}</span>
            </span>
            <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
          </div>
        </header>

        <div className="gatehouseChrome">
          <div className="gatehouseNavButtons">
            <button type="button" disabled={backDisabled} onClick={goBack} title="Back" aria-label="Back"><ArrowLeft size={17} /></button>
            <button type="button" disabled={forwardDisabled} onClick={goForward} title="Forward" aria-label="Forward"><ArrowRight size={17} /></button>
            <button type="button" disabled={current === GATEHOUSE_HOME || currentPolicy.kind === 'blocked'} onClick={reload} title={activeTab.loading ? 'Stop loading' : 'Reload'} aria-label={activeTab.loading ? 'Stop loading' : 'Reload'}>
              {activeTab.loading ? <X size={16} /> : <RefreshCw size={17} />}
            </button>
          </div>

          <div className="gatehouseOmniboxWrap">
            <form className="gatehouseOmnibox" onSubmit={submit}>
              <button type="button" className={`gatehouseSecurityButton gatehouseSecurityIcon ${currentPolicy.kind}`} title={`${securityTitle} · Open PArAsYtE Shields`} aria-label="Open PArAsYtE Shields" aria-expanded={shieldOpen} onClick={() => setShieldOpen(open => !open)}>
                {currentPolicy.kind === 'blocked' || !currentPolicy.secure ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
              </button>
              <input ref={addressRef} value={address} placeholder="Search or enter a URL" aria-label="Search or enter a web address" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event: ChangeEvent<HTMLInputElement>) => setActiveAddress(event.target.value)} />
              <button type="submit" title="Go" aria-label="Go"><Search size={16} /></button>
            </form>

            {shieldOpen && (
              <div className="gatehouseShieldPanel" role="dialog" aria-label="PArAsYtE Shields">
                <div className="gatehouseShieldHeader">
                  <span className={`gatehouseShieldBadge ${currentPolicy.kind}`}>{currentPolicy.kind === 'blocked' ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}</span>
                  <div><strong>PArAsYtE Shields</strong><span>{currentPolicy.kind === 'home' ? 'Private new tab' : currentPolicy.hostname || 'Protected destination'}</span></div>
                </div>
                <p>{trustReason}</p>
                <ul className="gatehouseShieldFacts">
                  <li><ShieldCheck size={13} /> PArAsYtE browser history is kept only for the open app session.</li>
                  <li><ShieldCheck size={13} /> Private/local network destinations are blocked by policy.</li>
                  <li><ShieldCheck size={13} /> Camera, microphone, location, payment and device permissions are denied by default.</li>
                  {useNativeSurface && <li><LockKeyhole size={13} /> Desktop pages run as top-level Chromium content, not as insecure iframe hacks.</li>}
                  {!isDesktop && currentPolicy.kind === 'embed' && <li><LockKeyhole size={13} /> {currentPolicy.allowSameOrigin ? 'This approved origin may keep its own signed-in session.' : 'This origin is isolated from persistent site storage.'}</li>}
                </ul>
                {!isDesktop && <div className="gatehouseShieldActions">
                  {currentPolicy.kind === 'external' && currentPolicy.secure && <button type="button" onClick={() => void trustCurrentOrigin()}><Plus size={13} /> Approve origin</button>}
                  {currentPolicy.kind === 'embed' && !currentPolicy.allowSameOrigin && <button type="button" onClick={() => void trustCurrentOrigin(true)}><LockKeyhole size={13} /> Remember session</button>}
                  {currentTrustedOrigin && <button type="button" className="secondary" onClick={() => void untrustOrigin(currentTrustedOrigin.id)}><Trash2 size={13} /> Remove approval</button>}
                </div>}
              </div>
            )}
          </div>

          <div className="gatehouseActions">
            <button type="button" className={currentSavedSite ? 'active' : ''} disabled={current === GATEHOUSE_HOME || currentPolicy.kind === 'blocked'} onClick={() => currentSavedSite ? void removeSite(currentSavedSite.id) : void saveSite()} title={currentSavedSite ? 'Remove bookmark' : 'Save bookmark'} aria-label={currentSavedSite ? 'Remove current bookmark' : 'Save current address'}>
              <Star size={17} fill={currentSavedSite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" disabled={current === GATEHOUSE_HOME || currentPolicy.kind === 'blocked'} onClick={openCurrentExternal} title="Open in system browser" aria-label="Open current address in system browser"><ExternalLink size={17} /></button>
          </div>
        </div>

        <div className="gatehouseTrustBar" aria-live="polite">
          <span className={`gatehouseTrustDot ${currentPolicy.kind}`} />
          <strong>{currentPolicy.kind === 'home' ? 'Protected PArAsYtE session' : currentPolicy.hostname || 'Blocked address'}</strong>
          <span>{trustReason}</span>
        </div>

        {message && <div className="moduleNotice" role="status"><span>{message}</span><button type="button" className="moduleNoticeDismiss" onClick={() => setMessage('')} title="Dismiss notification" aria-label="Dismiss notification"><X size={14} /></button></div>}

        <div className="gatehouseBody">
          <aside className="gatehouseSidebar">
            <nav className="gatehouseSideNav" aria-label="PArAsYtE navigation">
              <button type="button" className={`gatehouseSideNavItem ${!internalPanel && current === GATEHOUSE_HOME ? 'active' : ''}`} onClick={goHome}><span className="gatehouseSideNavIcon"><Home size={20} /></span><span>Home</span></button>
              <button type="button" className="gatehouseSideNavItem" onClick={() => { setInternalPanel(null); goHome(); window.setTimeout(() => homeSearchRef.current?.focus(), 0) }}><span className="gatehouseSideNavIcon"><Compass size={20} /></span><span>Explore</span></button>
              <button type="button" className={`gatehouseSideNavItem ${internalPanel === 'bookmarks' ? 'active' : ''}`} onClick={() => { setInternalPanel('bookmarks'); setShieldOpen(false); setSettingsOpen(false) }}><span className="gatehouseSideNavIcon"><Bookmark size={19} /></span><span>Bookmarks</span></button>
              <button type="button" className={`gatehouseSideNavItem ${internalPanel === 'downloads' ? 'active' : ''}`} onClick={() => { setInternalPanel('downloads'); setShieldOpen(false); setSettingsOpen(false) }}><span className="gatehouseSideNavIcon"><Download size={19} /></span><span>Downloads</span></button>
              <button type="button" className="gatehouseSideNavItem" onClick={() => { setSettingsOpen(true); setShieldOpen(false) }}><span className="gatehouseSideNavIcon"><Settings size={19} /></span><span>Settings</span></button>
            </nav>

            <div className="gatehouseSidebarLibrary">
              {favorites.length > 0 && <><div className="gatehouseSidebarTitle"><Star size={12} /> Favorites</div>{favorites.slice(0, 4).map(site => <button type="button" key={site.id} title={site.title} onClick={() => navigate(site.url)}><Globe2 size={14} /><span>{site.title}</span></button>)}</>}
              {sites.length > 0 && <><div className="gatehouseSidebarTitle"><Bookmark size={12} /> Saved sites</div>{sites.slice(0, 5).map(site => <div className="gatehouseSiteRow" key={site.id}><button type="button" onClick={() => navigate(site.url)}><Globe2 size={14} /><span>{site.title}</span></button><button type="button" className="remove" onClick={() => void removeSite(site.id)} title="Remove site" aria-label={`Remove ${site.title}`}><Trash2 size={12} /></button></div>)}</>}
              {trustedOrigins.length > 0 && <><div className="gatehouseSidebarTitle"><ShieldCheck size={12} /> Web approvals</div>{trustedOrigins.slice(0, 3).map(origin => <div className="gatehouseSiteRow" key={origin.id}><span className="gatehouseOriginLabel"><LockKeyhole size={12} />{origin.origin}{origin.allow_same_origin && <em title="Also keeps its own session">·session</em>}</span><button type="button" className="remove" onClick={() => void untrustOrigin(origin.id)} title="Remove web approval" aria-label={`Remove ${origin.origin} from approved origins`}><Trash2 size={12} /></button></div>)}</>}
            </div>

            <div className="gatehouseSidebarFooter gatehouseSidebarFooterConcept"><span>Faster</span><span>Safer</span><span>Together</span></div>
          </aside>

          <main className="gatehouseViewport">
            {internalPanel ? renderInternalPanel() : currentPolicy.kind === 'home' ? (
              <div className="gatehouseHome" data-pt-wallpaper={appearance.wallpaper === 'custom' && !profile?.wallpaper_url ? 'default' : appearance.wallpaper} style={appearance.wallpaper === 'custom' && profile?.wallpaper_url ? { backgroundImage: `url(${profile.wallpaper_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                <ParasyteScene className="gatehouseHomeScene" />
                <div className="gatehouseHomeMotto gatehouseHomeMottoRight" aria-hidden="true"><span>PEOPLE</span><span>IDEAS</span><span>A BRIGHTER WEB</span></div>
                <div className="gatehouseHomeHero">
                  <div className="gatehouseHomeLogoHalo"><ParasyteMark size={82} /></div>
                  <h1><strong>PArAsYtE</strong> Browser</h1>
                  <span className="eyebrow">A CLEANER WEB TOGETHER</span>
                  <form className="gatehouseHomeSearch" onSubmit={submitHome}>
                    <Search size={21} />
                    <input ref={homeSearchRef} value={address} placeholder="Search the web, privately..." aria-label="Search the web" onChange={(event: ChangeEvent<HTMLInputElement>) => setActiveAddress(event.target.value)} />
                    <button type="submit" aria-label="Search"><ArrowRight size={19} /></button>
                  </form>
                </div>

                <div className="gatehouseQuickGrid" aria-label="Quick access">
                  {sites.length > 0 ? sites.slice(0, 5).map(site => <button type="button" className="gatehouseQuickTile" key={site.id} onClick={() => navigate(site.url)}><span className="gatehouseQuickIcon"><Globe2 size={22} /></span><span>{site.title}</span></button>) : <>
                    <button type="button" className="gatehouseQuickTile" onClick={() => navigate('https://www.youtube.com')}><span className="gatehouseQuickIcon"><Youtube size={22} /></span><span>YouTube</span></button>
                    <button type="button" className="gatehouseQuickTile" onClick={() => navigate('https://github.com')}><span className="gatehouseQuickIcon"><Github size={22} /></span><span>GitHub</span></button>
                    <button type="button" className="gatehouseQuickTile" onClick={() => navigate('https://www.notion.so')}><span className="gatehouseQuickIcon"><Globe2 size={21} /></span><span>Notion</span></button>
                    <button type="button" className="gatehouseQuickTile gatehouseQuickTileAccent" onClick={() => navigate('https://chatgpt.com')}><span className="gatehouseQuickIcon"><Sparkles size={22} /></span><span>AI Tools</span></button>
                    <button type="button" className="gatehouseQuickTile" onClick={() => navigate('https://www.figma.com')}><span className="gatehouseQuickIcon"><Figma size={22} /></span><span>Figma</span></button>
                  </>}
                  <button type="button" className="gatehouseQuickTile gatehouseQuickTileAdd" onClick={() => { homeSearchRef.current?.focus(); homeSearchRef.current?.select() }}><span className="gatehouseQuickIcon"><Plus size={24} /></span><span>Add site</span></button>
                </div>

                <div className="gatehouseHomeFeatureGrid">
                  <article className="gatehouseFeatureCard gatehouseFeatureCardGold"><div className="gatehouseFeatureIcon"><ShieldCheck size={22} /></div><div><h2>Real desktop browsing</h2><p>The desktop app now loads sites such as YouTube as top-level native Chromium content instead of breaking them inside an iframe.</p></div><span className="gatehouseFeatureArrow"><ArrowRight size={18} /></span></article>
                  <article className="gatehouseFeatureCard gatehouseFeatureCardBlue"><div className="gatehouseFeatureIcon"><Sparkles size={22} /></div><div><h2>Tabs that actually work</h2><p>Open, switch and close independent tabs with keyboard shortcuts, navigation history and isolated desktop content.</p></div><span className="gatehouseFeatureArrow"><ArrowRight size={18} /></span></article>
                </div>
                <div className="gatehouseHomeFooterMotto" aria-hidden="true"><Compass size={14} /> EXPLORE · CREATE · BELONG</div>
              </div>
            ) : currentPolicy.kind === 'blocked' ? (
              <div className="gatehouseExternalNotice gatehouseBlockedNotice"><div className="gatehouseNoticeIcon"><ShieldAlert size={32} /></div><span className="gatehouseNoticeEyebrow">PArAsYtE SECURITY</span><h3>Navigation blocked</h3><p>{currentPolicy.reason}</p><code>{current}</code><div className="gatehouseExternalActions"><button type="button" className="secondary" onClick={goHome}><Home size={16} /> Return home</button></div></div>
            ) : useNativeSurface ? (
              <div className="gatehouseNativeFrameShell">
                <div className="gatehouseFrameStatus" aria-live="polite">
                  <span className={`gatehouseFrameDot ${activeTab.error ? 'failed' : activeTab.loading ? 'loading' : 'ready'}`} />
                  <span>{activeTab.error || (activeTab.loading ? 'Loading native tab…' : 'Protected native tab · ephemeral browsing session')}</span>
                  <button type="button" onClick={openCurrentExternal}><ExternalLink size={13} /> Open outside</button>
                </div>
                <div className="gatehouseNativeSurface" ref={nativeSurfaceRef}>
                  <div className="gatehouseNativeSurfaceFallback"><Globe2 size={28} /><span>{activeTab.loading ? 'Opening page…' : 'Native browser surface'}</span></div>
                </div>
              </div>
            ) : webNeedsTopLevel ? (
              <div className="gatehouseExternalNotice"><div className="gatehouseNoticeIcon"><Globe2 size={32} /></div><span className="gatehouseNoticeEyebrow">TOP-LEVEL BROWSING REQUIRED</span><h3>This site cannot run reliably inside the web app</h3><p>{currentPolicy.hostname} uses browser features and anti-framing protections that are incompatible with an iframe. Use the PArAsYtE desktop app for a real native tab, or open it in your system browser.</p><code>{current}</code><div className="gatehouseExternalActions"><button type="button" onClick={openCurrentExternal}><ExternalLink size={16} /> Open outside</button><button type="button" className="secondary" onClick={goHome}><Home size={16} /> Home</button></div></div>
            ) : currentPolicy.kind === 'external' ? (
              <div className="gatehouseExternalNotice"><div className="gatehouseNoticeIcon">{currentPolicy.secure ? <ShieldCheck size={32} /> : <ShieldAlert size={32} />}</div><span className="gatehouseNoticeEyebrow">{currentPolicy.secure ? 'WEB BUILD LIMITATION' : 'INSECURE DESTINATION'}</span><h3>{currentPolicy.secure ? 'Open this site outside the web build' : 'This connection is not encrypted'}</h3><p>{currentPolicy.secure ? 'A normal hosted web page cannot become a full browser engine. Install the desktop app to open public sites as native PArAsYtE tabs.' : 'Plain HTTP is not embedded inside the hosted PArAsYtE app.'}</p><code>{current}</code><div className="gatehouseExternalActions"><button type="button" onClick={openCurrentExternal}><ExternalLink size={16} /> Open in a tab</button>{currentPolicy.secure && <button type="button" className="secondary" onClick={() => void trustCurrentOrigin()}><Plus size={16} /> Approve iframe fallback</button>}<button type="button" className="secondary" onClick={goHome}><Home size={16} /> Home</button></div></div>
            ) : (
              <div className="gatehouseFrameShell">
                <div className="gatehouseFrameStatus" aria-live="polite">
                  <span className={`gatehouseFrameDot ${activeTab.frameStatus}`} />
                  <span>{activeTab.frameStatus === 'loading' && 'Loading securely…'}{activeTab.frameStatus === 'ready' && (currentPolicy.allowSameOrigin ? 'Loaded · session remembered for this approved origin' : 'Loaded · isolated sandbox')}{activeTab.frameStatus === 'slow' && 'This site is taking longer than expected'}{activeTab.frameStatus === 'failed' && 'The embedded site could not be loaded'}{activeTab.frameStatus === 'idle' && 'Ready'}</span>
                  {(activeTab.frameStatus === 'slow' || activeTab.frameStatus === 'failed') && <button type="button" onClick={reload}><RefreshCw size={13} /> Retry</button>}
                  {!currentPolicy.allowSameOrigin && <button type="button" onClick={() => void trustCurrentOrigin(true)}><Plus size={13} /> Keep me signed in here</button>}
                  <button type="button" onClick={openCurrentExternal}><ExternalLink size={13} /> Open outside</button>
                </div>
                <iframe key={`${activeTab.id}-${current}-${activeTab.reloadKey}`} title="PArAsYtE web fallback" src={current} referrerPolicy="no-referrer" sandbox={currentPolicy.allowSameOrigin ? 'allow-forms allow-scripts allow-same-origin' : 'allow-forms allow-scripts'} allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; serial 'none'; hid 'none'; clipboard-read 'none'; clipboard-write 'none'" onLoad={() => updateTab(activeTab.id, tab => ({ ...tab, frameStatus: 'ready', loading: false }))} onError={() => updateTab(activeTab.id, tab => ({ ...tab, frameStatus: 'failed', loading: false }))} />
                {(activeTab.frameStatus === 'slow' || activeTab.frameStatus === 'failed') && <div className="gatehouseFrameFallback">This site may refuse iframe embedding. The PArAsYtE desktop app no longer uses iframes for normal browsing and can open it as a native tab.</div>}
              </div>
            )}
          </main>
        </div>

        {settingsOpen && <SettingsPanel user={user} appearance={appearance} profile={profile} trustedOrigins={trustedOrigins} onUntrustOrigin={(originId) => void untrustOrigin(originId)} onAppearanceChange={setAppearance} onProfileChange={setProfile} onClose={() => setSettingsOpen(false)} />}
      </div>
    </section>
  )
}
