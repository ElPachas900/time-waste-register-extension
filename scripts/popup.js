const fileInput = document.getElementById("postFile");
const resetBtn = document.getElementById("resetStyle");

function applyCSS(cssContent) {
  let oldStyle = document.getElementById("uploaded-style");
  if (oldStyle) oldStyle.remove();

  if (!cssContent) return;

  const style = document.createElement("style");
  style.id = "uploaded-style";
  style.textContent = cssContent;
  document.head.appendChild(style);
}

chrome.storage.local.get("userCSS", ({ userCSS }) => {
  if (userCSS) {
    applyCSS(userCSS);
  }
});

fileInput.addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const cssContent = e.target.result;

    chrome.storage.local.set({ userCSS: cssContent }, () => {
      applyCSS(cssContent);
    });
  };
  reader.readAsText(file);
});

resetBtn.addEventListener("click", () => {
  chrome.storage.local.remove("userCSS", () => {
    applyCSS(null);
    fileInput.value = "";
  });
});

const eTab = document.getElementById('e_twr_tab');
const eDomain = document.getElementById('e_twr_domain');
const eBrowser = document.getElementById('e_twr_browser');

const browserPlayBtn = document.getElementById('browser_playBtn');
const domainPlayBtn = document.getElementById('domain_playBtn');
const tabPlayBtn = document.getElementById('tab_playBtn');

const browserVisibilityBtn = document.getElementById('browserVisibility');
const domainVisibilityBtn = document.getElementById('domainVisibility');
const tabVisibilityBtn = document.getElementById('tabVisibility');

const timersContainer = document.getElementById("timers_scroller");

const pad2 = n => String(n).padStart(2, '0');
function fmtCs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(cs)}`;
}

async function updateCorner() {
  chrome.runtime.sendMessage({ type: 'twr_get_all' }, snap => {
    if (!snap) return;
    if (eTab) eTab.textContent = fmtCs(snap.tabElapsed || 0);
    if (eDomain) eDomain.textContent = fmtCs(snap.domainElapsed || 0);
    if (eBrowser) eBrowser.textContent = fmtCs(snap.browserElapsed || 0);
  });
}

function setupPlayButton(btn, scope) {
  btn.addEventListener('click', async () => {
    const currentlyPaused = btn.classList.contains('fa-play');
    const type = currentlyPaused ? 'twr_resume' : 'twr_pause';
    let domain = null;
    let tabId = null;

    if (scope === 'domain') {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      domain = tabs[0]?.url ? new URL(tabs[0].url).hostname.replace(/^www\./, '') : null;
    }
    if (scope === 'tab') {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tabs[0]?.id ?? null;
    }

    chrome.runtime.sendMessage({ type, scope, domain, tabId }, () => {
      if (chrome.runtime.lastError) return;
      btn.className = currentlyPaused ? 'fa-solid fa-pause' : 'fa-solid fa-play';
      updateCorner();
    });
  });
}

function setupVisibilityButton(btn, timerId) {
  btn.addEventListener('click', async () => {
    const isHidden = btn.classList.contains('fa-eye-slash');
    btn.className = isHidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: 'twr_set_hidden', id: timerId, hidden: !isHidden });
  });
}

const timersMap = new Map();

function htmlToElement(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = (html || '').trim();
  return tpl.content.firstElementChild || null;
}

function startTick(id) {
  const state = timersMap.get(id);
  if (!state || state.interval) return;
  state.interval = setInterval(() => {
    const now = Date.now();
    const ms = state.running ? (state.startTime ? (now - state.startTime) : 0) : (state.elapsed || 0);
    if (state.timerEl) state.timerEl.textContent = fmtCs(ms);
  }, 200);
}

function stopTick(id) {
  const state = timersMap.get(id);
  if (state?.interval) {
    clearInterval(state.interval);
    state.interval = null;
  }
}

function updateDisplayOnce(state) {
  if (!state) return;
  const ms = state.running ? (state.startTime ? (Date.now() - state.startTime) : 0) : (state.elapsed || 0);
  if (state.timerEl) state.timerEl.textContent = fmtCs(ms);
}

function truncateReplaceLastTwo(text) {
  if (!text) return "";
  if (text.length <= 8) return text;
  return text.slice(0, text.length - 2) + "...";
}

function applyTruncation(clone) {
  // Go through child nodes of the cloned wrapper
  for (const node of clone.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = node.nodeValue.trim();
      if (!txt) continue;
      if (/^[\d\s:.,]+$/.test(txt)) continue;

      node.nodeValue = truncateReplaceLastTwo(txt);
      return;
    }
  }
}


function createTimerDOM(entry) {
  const id = entry.timer?.id || entry.id || (entry.html && (entry.html.match(/id="([^"]+)"/) || [])[1]);
  if (!id) return null;
  if (timersMap.has(id)) return timersMap.get(id).node;

  const wrapper = document.createElement("div");
  wrapper.className = "timer-entry";
  wrapper.dataset.id = id;
  wrapper.dataset.tabId = entry.tabId ?? entry.timer?.tabId ?? "";

  const contentEl = htmlToElement(entry.html);
  const clone = contentEl ? contentEl.cloneNode(true) : document.createElement("div");
  if (!contentEl) clone.innerHTML = entry.html || `<div>${id}</div>`;

  const innerTimerEl = clone.querySelector('[id^="timer"]');
  const candidates = clone.querySelectorAll("span,div,a,p");
  let labelDone = false;
  for (const el of candidates) {
    const txt = el.textContent?.trim();
    if (!txt) continue;
    if (innerTimerEl && el.contains(innerTimerEl)) continue;
    if (/^[\d\s:.,]+$/.test(txt)) continue;
    el.textContent = truncateReplaceLastTwo(txt);
    labelDone = true;
    break;
  }

  if (!labelDone) {
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const txt = node.nodeValue?.trim();
      if (!txt) continue;
      if (innerTimerEl && innerTimerEl.contains(node.parentElement)) continue;
      if (/^[\d\s:.,]+$/.test(txt)) continue;
      node.nodeValue = truncateReplaceLastTwo(txt);
      break;
    }
  }

  applyTruncation(clone);

  wrapper.appendChild(clone);
  timersContainer.appendChild(wrapper);


  const timerEl = wrapper.querySelector('[id^="timer"]') || wrapper.querySelector("a,span");
  const stopBtn = wrapper.querySelector('[id^="stop-button-"]') || wrapper.querySelector("[data-stop]");
  const removeBtn = wrapper.querySelector('[id^="remove-button-"]') || wrapper.querySelector("[data-remove]");

  const state = {
    id,
    node: wrapper,
    timerEl,
    stopBtn,
    removeBtn,
    running: Boolean(entry.timer?.running),
    startTime: entry.timer?.startTime ?? null,
    elapsed: entry.timer?.elapsed ?? 0,
    tabId: entry.tabId ?? entry.timer?.tabId ?? null,
    interval: null,
  };

  if (stopBtn) {
    stopBtn.style.cursor = "pointer";
    stopBtn.textContent = entry.timer?.running ? "⏸️" : "▶️";
    stopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const cur = timersMap.get(id);
      if (!cur) return;
      const action = cur.running ? "pause" : "resume";

      chrome.runtime.sendMessage({ type: "twr_control", action, timerId: id, tabId: cur.tabId }, () => {});
      if (cur.running) {
        cur.elapsed = cur.startTime ? Date.now() - cur.startTime : cur.elapsed || 0;
        cur.running = false;
        cur.startTime = null;
        stopTick(id);
        updateDisplayOnce(cur);
        stopBtn.textContent = "▶️";
      } else {
        cur.startTime = Date.now() - (cur.elapsed || 0);
        cur.running = true;
        startTick(id);
        stopBtn.textContent = "⏸️";
      }
    });
  }

  if (removeBtn) {
    removeBtn.style.cursor = "pointer";
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const cur = timersMap.get(id);
      if (!cur) return;
      chrome.runtime.sendMessage({ type: "twr_control", action: "remove", timerId: id, tabId: cur.tabId }, () => {});
      stopTick(id);
      try { cur.node.remove(); } catch {}
      timersMap.delete(id);
    });
  }

  timersMap.set(id, state);
  if (state.running) startTick(id);
  else updateDisplayOnce(state);

  return wrapper;
}



document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get({ sharedTimers: [] }, (data) => {
    (data.sharedTimers || []).forEach(entry => createTimerDOM(entry));
  });

  setupPlayButton(browserPlayBtn, "browser");
  setupPlayButton(domainPlayBtn, "domain");
  setupPlayButton(tabPlayBtn, "tab");
  setupVisibilityButton(browserVisibilityBtn, "twr_browser_timer");
  setupVisibilityButton(domainVisibilityBtn, "twr_domain_timer");
  setupVisibilityButton(tabVisibilityBtn, "twr_tab_timer");

  setInterval(updateCorner, 1000);
  updateCorner();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === "twr_shared_add") {
    if (!timersMap.has(msg.id)) createTimerDOM(msg);
    return;
  }

  if (msg.type === "twr_shared_update") {
    const state = timersMap.get(msg.id);
    if (state) {
      if (msg.timer) {
        if (typeof msg.timer.running === 'boolean') state.running = Boolean(msg.timer.running);
        if (typeof msg.timer.elapsed === 'number') state.elapsed = msg.timer.elapsed;
        if (typeof msg.timer.startTime === 'number') state.startTime = msg.timer.startTime;
      }
      if (msg.tabId) state.tabId = msg.tabId;
      if (state.running) startTick(state.id);
      else stopTick(state.id);
      updateDisplayOnce(state);
    } else {
      createTimerDOM(msg);
    }
    return;
  }

  if (msg.type === "twr_shared_remove") {
    const s = timersMap.get(msg.id);
    if (s) {
      stopTick(msg.id);
      try { s.node.remove(); } catch {}
      timersMap.delete(msg.id);
    }
    return;
  }
});
