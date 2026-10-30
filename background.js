const api = browser;
const tabsWithWindows = new Set();
const stateByTab = new Map(); // tabId -> {windows:[...]} (memory only, cleared when the browser closes)

async function refreshBadge() {
  const { enabled } = await api.storage.local.get("enabled");
  api.browserAction.setBadgeText({ text: enabled ? "ON" : "" });
  api.browserAction.setBadgeBackgroundColor({ color: "#16a34a" });
}
refreshBadge();

// Toolbar button toggles "left-click opens link in floating window" mode.
api.browserAction.onClicked.addListener(async () => {
  const { enabled } = await api.storage.local.get("enabled");
  await api.storage.local.set({ enabled: !enabled });
  refreshBadge();
});

// Content script tells us when a tab has floating windows open.
api.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !sender.tab) return;
  const id = sender.tab.id;
  if (msg.type === "windows") {
    if (msg.count > 0) tabsWithWindows.add(id);
    else tabsWithWindows.delete(id);
  } else if (msg.type === "saveState") {
    if (msg.state && msg.state.windows && msg.state.windows.length) stateByTab.set(id, msg.state);
    else stateByTab.delete(id);
  } else if (msg.type === "getState") {
    return Promise.resolve(stateByTab.get(id) || null);
  }
});
api.tabs.onRemoved.addListener((id) => { tabsWithWindows.delete(id); stateByTab.delete(id); });
api.tabs.onUpdated.addListener((id, info) => {
  if (info.url) tabsWithWindows.delete(id); // top-level navigation resets the page
});

// Many sites forbid being framed. Strip those headers ONLY for tabs that currently
// have floating windows open.
api.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (!tabsWithWindows.has(d.tabId)) return {};
    const headers = d.responseHeaders
      .filter((h) => !["x-frame-options"].includes(h.name.toLowerCase()))
      .map((h) => {
        if (h.name.toLowerCase() === "content-security-policy" && h.value) {
          h.value = h.value
            .split(";")
            .filter((p) => !p.trim().toLowerCase().startsWith("frame-ancestors"))
            .join(";");
        }
        return h;
      });
    return { responseHeaders: headers };
  },
  { urls: ["<all_urls>"], types: ["sub_frame"] },
  ["blocking", "responseHeaders"]
);
