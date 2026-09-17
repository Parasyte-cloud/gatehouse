# PArAsYtE Browser - senior audit and Brave comparison

Date: 17 September 2026

## Audit findings fixed in this revision

1. **The inner macOS-style traffic lights were decorative only.** They were `<span>` elements with no Electron bridge. They are now real accessible buttons wired through the preload bridge to `BrowserWindow` for close, minimise and maximise/restore.
2. **Browser size presets were visually collapsing to the same width.** Balanced, Expanded and Maximized all used max-width values larger than the available viewport, so `min(..., 100%)` rendered them almost identically. The presets now have distinct responsive width/height values, and the Electron build also resizes the actual native window.
3. **Glow levels were too close together.** Subtle, Medium and High now use clearly separated near-edge and ambient gold/blue shadows, with matching Settings previews.
4. **Preset wallpaper selection depended on the optional `gatehouse_profiles` table.** A missing migration/RLS issue made a purely visual setting fail. Preset wallpaper is now instant, device-local appearance state; custom uploaded wallpaper remains account-backed.
5. **Wallpaper gradients could be hidden by the full-screen PArAsYtE scene layer.** Non-default wallpapers now intentionally fade that scene so the selected wallpaper is actually visible.
6. **There was no light/dark appearance system.** Settings now provides System, Dark and Light modes, with live OS-following behavior in System mode and a full light-glass treatment for the browser, settings and authentication surfaces.

## Brave model reviewed

Official Brave material reviewed for this comparison:

- Brave desktop release notes: https://brave.com/latest/
- Brave desktop what's new: https://brave.com/whats-new/desktop/
- Brave Shields: https://brave.com/shields/
- Brave privacy features: https://brave.com/privacy-features/
- Brave Split View help: https://support.brave.com/hc/en-us/articles/35087087593997-How-do-I-use-Split-view-in-Brave
- Brave Sidebar help: https://support.brave.com/hc/en-us/articles/5181998802061-How-do-I-use-Brave-Sidebar
- Brave vertical tabs: https://brave.com/blog/vertical-tabs/
- Brave feature overview: https://brave.com/about/
- Brave Leo: https://brave.com/leo/

## Features added now, inspired by useful Brave patterns

### PArAsYtE Shields

The address-bar security indicator is now interactive. It opens a privacy/security panel showing the actual guarantees PArAsYtE can enforce today: in-memory history, popup/top-level redirect restrictions, denied sensitive device permissions, approval state, and whether a trusted origin may retain its own session. It also exposes the relevant approve / remember-session / remove-approval actions.

This deliberately uses PArAsYtE's real sandbox model rather than claiming Brave-style ad/tracker blocking that the current renderer does not implement.

### Adaptive sidebar

Settings now supports:

- Always visible
- Auto-hide / compact rail
- Hidden

This follows the interaction model of Brave Sidebar while preserving PArAsYtE's saved sites, approved origins and navigation controls.

### Appearance system

PArAsYtE now has:

- System / Light / Dark colour modes
- Four functional size presets
- Four clearly distinct glow levels
- Local preset wallpapers
- Existing custom account wallpaper support

## Brave capabilities that should be the next native-browser phase

These should **not** be faked inside the current single-renderer/iframe model:

### Real multi-tab engine and vertical tabs

Brave supports horizontal/vertical tabs, pinning, groups and collapsing. PArAsYtE's current top tabs are mostly presentation chrome around one browsing context. The right next step is a real per-tab state model backed by Electron `WebContentsView` (preferred for a modern Electron architecture) or carefully isolated web contents. Once that exists, vertical tabs, pinning, groups, tab search and duplicate-tab commands become honest features rather than UI-only simulations.

### Split View

Brave Split View runs two independent tabs side by side. PArAsYtE should implement this only after real tabs exist, then render two independent tab web contents with a draggable divider.

### Containers / session isolation

Brave desktop containers isolate cookies and storage between tabs. PArAsYtE already has the conceptual seed of this feature with per-origin storage trust. The native phase should extend that to explicit session partitions such as Personal, Work, Banking and Temporary, with separate persistent Electron sessions.

### Browser-engine privacy protections

Brave Shields can block ads/trackers, cross-site tracking, fingerprinting techniques and other network/content behavior at browser-engine level. PArAsYtE's current sandbox blocks sensitive permissions and limits embedded-site capabilities, but it is not yet an ad/tracker blocker. A native implementation should use Electron session request filtering/content blocking rather than representing sandboxing as equivalent to Brave Shields.

### Extension support

Chrome-extension compatibility requires native Chromium/Electron extension APIs and a permission model. It should not be implemented as arbitrary JavaScript injected into framed pages.

### Reader mode, translation and AI assistant

Brave offers Speedreader, translation and Leo. These are good later-stage product features once PArAsYtE has a real tab/content pipeline. An assistant should receive page content only after explicit user action and with clear privacy boundaries.

### Encrypted sync

Brave syncs browser data across devices with client-side encryption. PArAsYtE currently syncs explicitly saved account data through Supabase, while device appearance remains local. A future sync design should be end-to-end encrypted before extending to tabs, settings, passwords or browsing-related data.

## Recommended implementation order

1. Finish and ship the settings/window-control reliability patch in this revision.
2. Replace decorative single-tab chrome with a real tab-state model.
3. Move desktop browsing from iframe framing toward isolated native web contents.
4. Add vertical tabs, pinning, groups and tab search.
5. Add Split View.
6. Add explicit containers/session partitions.
7. Add browser-level network/privacy controls and a richer Shields dashboard.
8. Only then evaluate extension support, reader/translate, AI and encrypted multi-device sync.

The key architectural rule is to preserve PArAsYtE's existing privacy promise: session/history state should remain ephemeral unless the user explicitly chooses otherwise.
