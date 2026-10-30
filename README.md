# PopDock - made it with claude

**Open any link in a floating pop-up window, right on top of the page you're reading.**

PopDock is a Firefox extension that lets you open websites in movable, resizable windows that float over your current page. Keep a video, a chat, docs, and a search open side by side without juggling tabs. It comes in two versions:

- **Desktop**: multiple windows with minimize, maximize, edge snapping, and tiling.
- **Mobile (Firefox for Android)**: long-press a link to open a free-floating, resizable pop-up.

---

## Features

### Desktop
- Open as many pop-up windows as you like
- Drag windows anywhere; resize from any edge or corner
- Minimize (to a dock at the bottom), maximize, restore, and close
- **Snap to screen sides**: drag a window to the left or right edge for a half screen, to a corner for a quarter, or to the top edge to maximize. A blue preview shows where it will land
- **Tile buttons**: auto-tile all windows, or arrange the 4 newest in a 2×2 grid
- **Hover to select**: hover a window to highlight it and scroll it without clicking
- The control dock always stays above every window
- Per-window address bar, reload, and "open in a normal tab" buttons
- Windows come back after a page reload or navigation in the same tab

### Mobile
- Long-press any link to open it in a pop-up
- Drag the title bar to move; resize from any edge or corner
- Close with the ✕ button
- Tap a window in the back to bring it forward
- Normal taps on links still work as usual

---

## How to use

### Desktop
1. Click the PopDock icon in the toolbar to turn **pop-up mode** on (a green **ON** badge appears).
2. **Left-click any link** and it opens in a floating window instead of navigating the page.
   - Not in pop-up mode? **Alt + click** a link to open a pop-up anyway.
3. Use the buttons on each window's title bar:

   | Button | Action |
   |---|---|
   | ◧ ◨ | Snap to the left / right half |
   | ⟳ | Reload the window |
   | ↗ | Open the page in a normal tab |
   | – | Minimize to the dock |
   | ▢ | Maximize / restore (or double-click the title bar) |
   | ✕ | Close |

4. **Drag the title bar** to move a window. Drag it to a screen edge or corner to snap it.
5. Use the dock at the bottom:
   - **＋ New**: open any URL in a new window
   - **▦ Tile**: auto-arrange all windows
   - **⊞ 4-Tile**: arrange the 4 newest windows in a 2×2 grid
   - **✕ All**: close every window
   - Minimized windows appear as chips; click one to restore it.

### Mobile
1. **Long-press a link** (about half a second). Your phone gives a small vibration and the pop-up opens.
2. **Drag the title bar** to move it.
3. **Drag any edge or corner** to resize it (the bottom-right corner has a visible grip).
4. Tap **✕** to close.
5. Open several at once and tap one in the back to bring it to the front.

---

## Installation

### Desktop Firefox (temporary, for testing)
1. Download or clone this repo.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on** and select `desktop/manifest.json`.

Temporary add-ons are removed when Firefox restarts. To keep it permanently, sign the extension through [addons.mozilla.org](https://addons.mozilla.org) (the free "On your own" self-distribution option), or use Firefox Developer Edition / Nightly with `xpinstall.signatures.required` set to `false`.

### Firefox for Android
Regular Firefox for Android only installs extensions from the official add-on store, so:
- **Option 1:** sign the extension for free via addons.mozilla.org (self-distribution), then in Firefox go to **Settings → About Firefox**, tap the logo 5 times to enable the debug menu, and choose **Install extension from file**.
- **Option 2:** use Firefox Nightly and set `xpinstall.signatures.required` to `false` in `about:config`.

---

## Limitations

- **Some sites refuse to be shown in a frame.** PopDock removes the headers that block this, but only for tabs that currently have pop-ups open. A few sites may still not load.
- **Logins may not stick.** Firefox's cookie protection can block cookies inside frames, so some sites (large account-based services, banks) may not keep you signed in.
- **Pop-ups live inside the page.** If the page reloads, pop-ups are restored on desktop but the sites inside them load again from the start. On mobile they close on reload.
- **Pop-ups reopen at their original address.** If you browse to other pages inside a pop-up, it comes back at the address it was opened with (or the last one you typed in its address bar).
- Doesn't run on `about:` pages or addons.mozilla.org.

---

## Permissions and privacy

| Permission | Why it's needed |
|---|---|
| `<all_urls>` | To run on the pages you browse and show pop-ups on them |
| `webRequest`, `webRequestBlocking` | To remove frame-blocking headers, only for tabs with open pop-ups |
| `tabs` | To know which tab has pop-ups open |
| `storage` (desktop) | To remember whether pop-up mode is on |

PopDock collects no data and sends nothing anywhere. Pop-up window positions are kept in memory only and are cleared when you close the tab or restart Firefox.

---

## Project structure

```
desktop/   Desktop Firefox extension
mobile/    Firefox for Android extension
```

## License

MIT. Add a `LICENSE` file to the repo.
