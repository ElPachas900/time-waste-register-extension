// scripts/background.js
const now = () => Date.now();

// ====== STATE for 3 main timers ======
const defaultState = () => ({
  browserAccum: 0,
  browserStart: null,
  domains: {},
  tabs: {},
  paused: { browser: false, domain: {}, tab: {} },
  tabDomain: {},
  lastActive: { tabId: null, domain: null }
});
let state = defaultState();
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  const { __twr_state } = await chrome.storage.session.get("__twr_state");
  if (__twr_state) state = __twr_state;
  loaded = true;
}
async function save() {
  await chrome.storage.session.set({ "__twr_state": state });
}

function getDomainRec(domain) {
  if (!domain) return { accum: 0, start: null };
  if (!state.domains[domain]) state.domains[domain] = { accum: 0, start: null };
  return state.domains[domain];
}
function getTabRec(tabId) {
  if (tabId == null) return { accum: 0, start: null };
  if (!state.tabs[tabId]) state.tabs[tabId] = { accum: 0, start: null };
  return state.tabs[tabId];
}
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch { return null; }
}

function startTracking(tabId, domain) {
  const t = now();
  if (!state.paused.browser && state.browserStart == null) state.browserStart = t;
  if (domain && !state.paused.domain[domain]) {
    const d = getDomainRec(domain);
    if (d.start == null) d.start = t;
  }
  if (tabId != null && !state.paused.tab[tabId]) {
    const tb = getTabRec(tabId);
    if (tb.start == null) tb.start = t;
  }
}
function stopTracking(tabId, domain) {
  const t = now();
  if (tabId != null) {
    const tb = getTabRec(tabId);
    if (tb.start != null) { tb.accum += t - tb.start; tb.start = null; }
  }
  if (domain) {
    const d = getDomainRec(domain);
    if (d.start != null) { d.accum += t - d.start; d.start = null; }
  }
  if (state.browserStart != null) { state.browserAccum += t - state.browserStart; state.browserStart = null; }
}
function pause(scope, tabId, domain) {
  const t = now();
  if (scope === "browser") {
    if (!state.paused.browser && state.browserStart != null) {
      state.browserAccum += t - state.browserStart;
      state.browserStart = null;
    }
    state.paused.browser = true;
    return;
  }
  if (scope === "domain" && domain) {
    const d = getDomainRec(domain);
    if (!state.paused.domain[domain] && d.start != null) {
      d.accum += t - d.start; d.start = null;
    }
    state.paused.domain[domain] = true;
    return;
  }
  if (scope === "tab" && tabId != null) {
    const tb = getTabRec(tabId);
    if (!state.paused.tab[tabId] && tb.start != null) {
      tb.accum += t - tb.start; tb.start = null;
    }
    state.paused.tab[tabId] = true;
  }
}
function resume(scope, tabId, domain) {
  const t = now();
  if (scope === "browser") {
    state.paused.browser = false;
    if (state.browserStart == null) state.browserStart = t;
    return;
  }
  if (scope === "domain" && domain) {
    state.paused.domain[domain] = false;
    const d = getDomainRec(domain);
    if (d.start == null) d.start = t;
    return;
  }
  if (scope === "tab" && tabId != null) {
    state.paused.tab[tabId] = false;
    const tb = getTabRec(tabId);
    if (tb.start == null) tb.start = t;
  }
}

// ====== WEBSITE SHARED TIMERS ======
function broadcastShared(type, payload) {
  chrome.runtime.sendMessage(Object.assign({ type }, payload || {}), () => {});
}
async function removeSharedTimerById(timerId) {
  const got = await chrome.storage.local.get({ sharedTimers: [] });
  const arr = (got.sharedTimers || []).filter(e => {
    const id = (e.timer && e.timer.id) || e.id || ((e.html && (e.html.match(/id="([^"]+)"/) || [])[1]));
    return id !== timerId;
  });
  await chrome.storage.local.set({ sharedTimers: arr });
  broadcastShared("twr_shared_remove", { id: timerId });
}

// ====== MAIN MESSAGE HANDLER ======
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    await ensureLoaded();
    const tabId = (msg.tabId ?? sender.tab?.id) ?? null;

    // --- Shared timers
    if (typeof msg.type === "string" && msg.type.startsWith("twr_shared_")) {
      let { sharedTimers = [] } = await chrome.storage.local.get("sharedTimers");

      if (msg.type === "twr_shared_add") {
        const id = msg.timer?.id || msg.id;
        if (!id) return;
        sharedTimers = sharedTimers.filter(t => t.id !== id);
        sharedTimers.push({ id, html: msg.html, timer: msg.timer, tabId });
        await chrome.storage.local.set({ sharedTimers });
        broadcastShared("twr_shared_add", { id, html: msg.html, timer: msg.timer, tabId });
        sendResponse({ ok: true }); return;
      }

      if (msg.type === "twr_shared_update") {
        const id = msg.timer?.id || msg.id;
        if (!id) return;
        sharedTimers = sharedTimers.map(t =>
          t.id === id ? { ...t, html: msg.html ?? t.html, timer: { ...t.timer, ...msg.timer } } : t
        );
        await chrome.storage.local.set({ sharedTimers });
        broadcastShared("twr_shared_update", { id, html: msg.html, timer: msg.timer, tabId });
        sendResponse({ ok: true }); return;
      }

      if (msg.type === "twr_shared_remove") {
        if (msg.id) await removeSharedTimerById(msg.id);
        sendResponse({ ok: true }); return;
      }
    }

    // --- Corner timers (pause/resume/start/stop)
    if (msg.type === "twr_pause") { pause(msg.scope, tabId, msg.domain || null); await save(); sendResponse({ ok: true }); return; }
    if (msg.type === "twr_resume") { resume(msg.scope, tabId, msg.domain || null); await save(); sendResponse({ ok: true }); return; }

    if (msg.type === "twr_get_all") {
      const tabsArr = await chrome.tabs.query({ active: true, currentWindow: true });
      const t = now();
      const active = tabsArr && tabsArr[0];
      if (!active || !active.id) {
        sendResponse({
          tabElapsed: 0,
          domainElapsed: 0,
          browserElapsed: state.browserAccum + (state.browserStart ? (t - state.browserStart) : 0)
        });
        return;
      }

      const tabId2 = active.id;
      const domain = extractDomain(active.url);

      if (state.lastActive && (state.lastActive.tabId !== tabId2 || state.lastActive.domain !== domain)) {
        stopTracking(state.lastActive.tabId, state.lastActive.domain);
      }
      if (!state.lastActive || state.lastActive.tabId !== tabId2 || state.lastActive.domain !== domain) {
        startTracking(tabId2, domain);
        state.tabDomain[tabId2] = domain;
        state.lastActive = { tabId: tabId2, domain };
      }

      const tb = getTabRec(tabId2);
      const d = getDomainRec(domain);

      const tabElapsed = tb.accum + (tb.start ? (t - tb.start) : 0);
      const domainElapsed = d.accum + (d.start ? (t - d.start) : 0);
      const browserElapsed = state.browserAccum + (state.browserStart ? (t - state.browserStart) : 0);

      sendResponse({ tabElapsed, domainElapsed, browserElapsed });
      return;
    }

    // --- Control shared timers
    if (msg.type === "twr_control") {
      const id = msg.timerId;
      const got = await chrome.storage.local.get("sharedTimers");
      const stored = (got.sharedTimers || []).find(t => t.id === id);
      const tabTo = Number(msg.tabId) || Number(stored?.tabId) || undefined;

      if (msg.action === "remove") {
        if (typeof tabTo === "number" && !Number.isNaN(tabTo)) {
          chrome.tabs.sendMessage(tabTo, { type: "twr_control", action: "remove", timerId: id });
        }
        await removeSharedTimerById(id);
      } else {
        if (typeof tabTo === "number" && !Number.isNaN(tabTo)) {
          chrome.tabs.sendMessage(tabTo, { type: "twr_control", action: msg.action, timerId: id });
        }
      }
      sendResponse({ ok: true }); return;
    }

    sendResponse({ ok: false, error: "unknown_message" });
  })();
  return true;
});
