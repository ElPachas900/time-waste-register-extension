(function () {
  const ID = 'twr_timer';
  if (document.getElementById(ID)) return;
  
  function shortenText(text) {
  if (text.length > 8) {
    return text.slice(0, -2) + "...";
  }
  return text;
  }

  const container = document.createElement('div');
  container.id = ID;
  Object.assign(container.style, {
    position: 'fixed',
    top: '0px',
    right: '0px',
    zIndex: 2147483647,
    fontFamily: 'Segoe UI, system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
    fontSize: '16px',
    pointerEvents: 'none'
  });

  const redEl = document.createElement('p');
  redEl.id = 'twr_browser_timer';
  redEl.style.color = '#f00'; redEl.style.margin = '0';
  const greenEl = document.createElement('p');
  greenEl.id = 'twr_domain_timer';
  greenEl.style.color = '#0f0'; greenEl.style.margin = '0';
  const blueEl = document.createElement('p');
  blueEl.id = 'twr_tab_timer';
  blueEl.style.color = '#00f'; blueEl.style.margin = '0';

  container.append(redEl, greenEl, blueEl);
  (document.documentElement || document.body).appendChild(container);

  const pad2 = n => String(n).padStart(2, '0');
  function fmtCs(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(cs)}`;
  }
  function updateOverlay() {
    chrome.runtime.sendMessage({ type: 'twr_get_all' }, snap => {
      if (!snap) return;
      redEl.textContent = fmtCs(snap.browserElapsed || 0);
      greenEl.textContent = fmtCs(snap.domainElapsed || 0);
      blueEl.textContent = fmtCs(snap.tabElapsed || 0);
    });
  }
  setInterval(updateOverlay, 1000);
  updateOverlay();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'twr_set_hidden' && msg.id) {
      const el = document.getElementById(msg.id);
      if (el) { el.hidden = !!msg.hidden; sendResponse({ ok: true }); }
      return true;
    }
    if (msg.type === 'twr_control') {
      window.postMessage({ type: 'twr_control', action: msg.action, timerId: msg.timerId }, '*');
      sendResponse({ ok: true });
      return true;
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data.type !== 'string') return;
    const msg = event.data;
    if (msg.type === 'twr_shared_add') {
      chrome.runtime.sendMessage({ type: 'twr_shared_add', html: msg.html, timer: msg.timer });
    } else if (msg.type === 'twr_shared_update') {
      chrome.runtime.sendMessage({ type: 'twr_shared_update', html: msg.html, timer: msg.timer });
    } else if (msg.type === 'twr_shared_remove') {
      chrome.runtime.sendMessage({ type: 'twr_shared_remove', id: msg.id ?? msg.timerId });
    }
  });
})();
