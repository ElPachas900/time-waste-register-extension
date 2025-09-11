const eTab = document.getElementById('e_twr_tab');
const eDomain = document.getElementById('e_twr_domain');
const eBrowser = document.getElementById('e_twr_browser');


const browserPlayBtn = document.getElementById('browser_playBtn');
const domainPlayBtn = document.getElementById('domain_playBtn');
const tabPlayBtn = document.getElementById('tab_playBtn');

const browserVisibilityBtn = document.getElementById('browserVisibility');
const domainVisibilityBtn = document.getElementById('domainVisibility');
const tabVisibilityBtn = document.getElementById('tabVisibility');

let browserPaused = false;
let domainPaused = false;
let tabPaused = false;

const pad2 = n => String(n).padStart(2, '0');
function fmtCs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(cs)}`;
}

function update() {
  chrome.runtime.sendMessage({ type: 'twr_get_all' }, snap => {
    if (!snap) return;
    if (eTab) eTab.textContent = fmtCs(snap.tabElapsed || 0);
    if (eDomain) eDomain.textContent = fmtCs(snap.domainElapsed || 0);
    if (eBrowser) eBrowser.textContent = fmtCs(snap.browserElapsed || 0);
  });
}

function setupPlayButton(btn, scope) {
  btn.className = "fa-solid fa-pause";

  btn.addEventListener("click", () => {
    const paused = btn.classList.contains("fa-play");
    const type = paused ? "twr_resume" : "twr_pause";

    if (scope === "tab") {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tabId = tabs[0].id;
    chrome.runtime.sendMessage({ type, scope, tabId });
  });
} else if (scope === "domain") {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const domain = new URL(tabs[0].url).hostname.replace(/^www\./, '');
    chrome.runtime.sendMessage({ type, scope, domain });
  });
} else {
  chrome.runtime.sendMessage({ type, scope });
}


  btn.className = paused ? "fa-solid fa-pause" : "fa-solid fa-play";
  });
}

setupPlayButton(browserPlayBtn, "browser");
setupPlayButton(domainPlayBtn, "domain");
setupPlayButton(tabPlayBtn, "tab");

function setupVisibilityButton(btn, target) {
  btn.className = "fa-solid fa-eye";

  btn.addEventListener("click", () => {
    const isHidden = btn.classList.contains("fa-eye-slash");
    btn.className = isHidden ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (target) => {
          const el = document.getElementById("twr_timer")?.querySelector(target);
          if (el) el.hidden = !el.hidden;
        },
        args: [target]
      });
    });
  });
}

setupVisibilityButton(browserVisibilityBtn, "p:nth-child(1)"); // red
setupVisibilityButton(domainVisibilityBtn, "p:nth-child(2)"); // green
setupVisibilityButton(tabVisibilityBtn, "p:nth-child(3)");   // blue

setInterval(update, 500);
update();
