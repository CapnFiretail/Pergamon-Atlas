(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hypot3(ax, ay, az, bx, by, bz) {
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    const metaEl = document.getElementById('atlas-meta');
    if (!metaEl) return;

    let meta;
    try { meta = JSON.parse(metaEl.textContent); }
    catch { return; }

    if (meta.archived) return;

    const PA  = window.PergamonAddress;
    const all = (typeof window.atlasEntries !== 'undefined')
      ? [...window.atlasEntries.tools, ...window.atlasEntries.games]
      : [];

    const currentPath = window.location.pathname
      .replace(/\/index\.html$/, '')
      .replace(/\/$/, '');

    const self = all.find(e => e.path === currentPath);

    const coords  = (self && self.coords)  || meta.coords;
    const address = (self && self.address) || meta.address || '—';
    const name    = (self && self.name)    || meta.name    || 'Unknown Artifact';
    const chamber = (self && self.chamber) || meta.chamber || '??';
    const seed    = (self && self.seed)    || meta.seed    || 0;

    if (!coords) return;

    const typeMap  = { TL: 'Tool', GM: 'Game', AR: 'Archive' };
    const typeName = typeMap[chamber] || chamber;

    const hex     = seed.toString(16).toUpperCase().padStart(8, '0');
    const artCode = `ART-${hex.slice(0, 4)}-${hex.slice(4)}`;

    // ── 6 directional neighbors ───────────────────────────────────────────

    const STEP = 500_000;
    const DIRS = [
      { label: '+X', dx:  1, dy:  0, dz:  0 },
      { label: '−X', dx: -1, dy:  0, dz:  0 },
      { label: '+Y', dx:  0, dy:  1, dz:  0 },
      { label: '−Y', dx:  0, dy: -1, dz:  0 },
      { label: '+Z', dx:  0, dy:  0, dz:  1 },
      { label: '−Z', dx:  0, dy:  0, dz: -1 },
    ];

    const others = all.filter(e => e.path !== currentPath);
    const seen   = new Set();
    const neighbors = [];

    for (const dir of DIRS) {
      const px = coords.x + dir.dx * STEP;
      const py = coords.y + dir.dy * STEP;
      const pz = coords.z + dir.dz * STEP;

      let closest = null, closestDist = Infinity;
      for (const e of others) {
        const d = hypot3(e.coords.x, e.coords.y, e.coords.z, px, py, pz);
        if (d < closestDist) { closestDist = d; closest = e; }
      }

      if (closest && !seen.has(closest.path)) {
        seen.add(closest.path);
        neighbors.push({ dir: dir.label, artifact: closest });
      }
    }

    // ── Catalogs ─────────────────────────────────────────────────────────

    const catalogs = [];
    if (chamber === 'TL') catalogs.push({ name: 'Tools Catalog', path: '/sectors/systems/tools' });
    if (chamber === 'GM') catalogs.push({ name: 'Games Catalog', path: '/sectors/systems/games' });

    // ── Inject ───────────────────────────────────────────────────────────

    injectStyles();

    const section = buildSection({
      name, artCode, typeName, address, neighbors, catalogs, PA, all
    });

    const footer = document.getElementById('footer-placeholder');
    if (footer) footer.parentNode.insertBefore(section, footer);
    else document.body.appendChild(section);

    updateSidebarDisplay(address);
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────

  function updateSidebarDisplay(address) {
    function trySet() {
      const el = document.getElementById('atlas-code-display');
      if (!el) return false;
      el.textContent = address;
      return true;
    }
    if (!trySet()) {
      const obs = new MutationObserver(function (_, o) { if (trySet()) o.disconnect(); });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ── Section builder ───────────────────────────────────────────────────────

  function buildSection({ name, artCode, typeName, address, neighbors, catalogs, PA, all }) {
    const el = document.createElement('section');
    el.id = 'atlas-reference';
    el.classList.add('ar-collapsed');

    el.innerHTML = `
      <div class="ar-toggle-bar">
        <div class="ar-bar-inner">
          <span class="ar-bar-wordmark">Pergamon Atlas</span>
          <span class="ar-bar-sep">·</span>
          <span class="ar-bar-name">${esc(name)}</span>
          <span class="ar-bar-sep ar-bar-sep-addr">·</span>
          <span class="ar-bar-addr">${esc(address)}</span>
          <button class="ar-toggle-btn" aria-label="Toggle Atlas Reference">
            Atlas Reference <span class="ar-arrow">▾</span>
          </button>
        </div>
      </div>

      <div class="ar-body">
        <div class="ar-inner">

          <div class="ar-header">
            <div class="ar-hl">
              <div class="ar-name">${esc(name)}</div>
              <div class="ar-type">${esc(typeName)}</div>
            </div>
            <div class="ar-hr">
              <div class="ar-code">${esc(artCode)}</div>
              <div class="ar-address">${esc(address)}</div>
            </div>
          </div>

          <nav class="ar-tabs" role="tablist">
            <button class="ar-tab active" data-tab="nearby"   role="tab">Explore Nearby</button>
            <button class="ar-tab"        data-tab="jump"     role="tab">Jump to Address</button>
            <button class="ar-tab"        data-tab="random"   role="tab">Random Jump</button>
            <button class="ar-tab"        data-tab="catalogs" role="tab">View Catalogs</button>
          </nav>

          <div class="ar-panel"           id="ar-panel-nearby"  >${buildNearbyPanel(neighbors)}</div>
          <div class="ar-panel ar-hidden" id="ar-panel-jump"    >${buildJumpPanel()}</div>
          <div class="ar-panel ar-hidden" id="ar-panel-random"  >${buildRandomPanel()}</div>
          <div class="ar-panel ar-hidden" id="ar-panel-catalogs">${buildCatalogsPanel(catalogs)}</div>

        </div>
      </div>
    `;

    // Toggle collapse
    el.querySelector('.ar-toggle-bar').addEventListener('click', () => {
      el.classList.toggle('ar-collapsed');
    });

    // Tab switching
    el.querySelectorAll('.ar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.ar-tab').forEach(t => t.classList.remove('active'));
        el.querySelectorAll('.ar-panel').forEach(p => p.classList.add('ar-hidden'));
        tab.classList.add('active');
        el.querySelector(`#ar-panel-${tab.dataset.tab}`).classList.remove('ar-hidden');
      });
    });

    // Jump
    const jumpInput = el.querySelector('#ar-jump-input');
    const jumpBtn   = el.querySelector('#ar-jump-btn');
    const jumpErr   = el.querySelector('#ar-jump-error');

    function doJump() {
      const raw = jumpInput.value.trim().toUpperCase();
      jumpErr.textContent = '';
      try {
        PA.addressToCoords(raw);
        const target = all.find(e => e.address === raw);
        if (target) {
          window.location.href = target.path;
        } else {
          jumpErr.textContent = 'No artifact found at this address.';
        }
      } catch {
        jumpErr.textContent = 'Invalid address format.';
      }
    }

    jumpBtn.addEventListener('click', doJump);
    jumpInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJump(); });

    // Random jump
    const randomBtn = el.querySelector('#ar-random-btn');
    const randomOut = el.querySelector('#ar-random-out');

    randomBtn.addEventListener('click', () => {
      const CMAX = PA.COORD_MAX;
      const rx = Math.floor((Math.random() * 2 - 1) * CMAX);
      const ry = Math.floor((Math.random() * 2 - 1) * CMAX);
      const rz = Math.floor((Math.random() * 2 - 1) * CMAX);
      const rAddr = PA.coordsToAddress(rx, ry, rz);

      randomOut.textContent = rAddr;

      let nearest = null, nearestDist = Infinity;
      for (const e of all) {
        const d = hypot3(e.coords.x, e.coords.y, e.coords.z, rx, ry, rz);
        if (d < nearestDist) { nearestDist = d; nearest = e; }
      }

      if (nearest) {
        randomBtn.disabled = true;
        randomBtn.textContent = 'Resolving…';
        setTimeout(() => { window.location.href = nearest.path; }, 700);
      }
    });

    return el;
  }

  // ── Panel builders ────────────────────────────────────────────────────────

  function buildNearbyPanel(neighbors) {
    if (!neighbors.length) {
      return `<p class="ar-empty">No artifacts detected in adjacent space.</p>`;
    }
    return neighbors.map(n => {
      const t = n.artifact.chamber === 'TL' ? 'Tool' : 'Game';
      return `
        <a class="ar-neighbor" href="${esc(n.artifact.path)}">
          <span class="ar-n-dir">${esc(n.dir)}</span>
          <span class="ar-n-name">${esc(n.artifact.name)}</span>
          <span class="ar-n-addr">${esc(n.artifact.address || '—')}</span>
          <span class="ar-n-badge">${esc(t)}</span>
        </a>`;
    }).join('');
  }

  function buildJumpPanel() {
    return `
      <div class="ar-jump-row">
        <input id="ar-jump-input" class="ar-input" type="text"
          placeholder="XXXXX-YYYYY-ZZZZZ" maxlength="17"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z2-9\\-]/g,'')">
        <button id="ar-jump-btn" class="ar-btn">Jump</button>
      </div>
      <div id="ar-jump-error" class="ar-error"></div>`;
  }

  function buildRandomPanel() {
    return `
      <button id="ar-random-btn" class="ar-btn">Generate Random Position</button>
      <div id="ar-random-out" class="ar-random-out"></div>`;
  }

  function buildCatalogsPanel(catalogs) {
    if (!catalogs.length) {
      return `<p class="ar-empty">This artifact has not been cataloged.</p>`;
    }
    return catalogs.map(c =>
      `<a class="ar-catalog-link" href="${esc(c.path)}">${esc(c.name)}</a>`
    ).join('');
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('ar-styles')) return;
    const s = document.createElement('style');
    s.id = 'ar-styles';
    s.textContent = `
#atlas-reference {
  background: #09080a;
  border-top: 2px solid #3a3020;
  font-family: Georgia, serif;
  color: #d6c89a;
  margin-top: 56px;
}

/* ── Toggle bar ── */
.ar-toggle-bar {
  padding: 0 32px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
}

.ar-toggle-bar:hover { border-bottom-color: #3a3020; }

.ar-bar-inner {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
}

.ar-bar-wordmark {
  font-size: 9px;
  letter-spacing: 0.4em;
  color: #8a7a5a;
  text-transform: uppercase;
  white-space: nowrap;
}

.ar-bar-sep {
  color: #4a4030;
  font-size: 12px;
}

.ar-bar-name {
  font-size: 13px;
  color: #c9a84c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.ar-bar-addr {
  font-size: 12px;
  color: #8a7a5a;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.ar-bar-sep-addr { flex-shrink: 0; }

.ar-toggle-btn {
  margin-left: auto;
  background: transparent;
  border: 1px solid #3a3020;
  color: #8a7a5a;
  font-family: Georgia, serif;
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 6px 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.12s, color 0.12s;
  flex-shrink: 0;
}

.ar-toggle-bar:hover .ar-toggle-btn {
  border-color: #c9a84c;
  color: #c9a84c;
}

.ar-arrow {
  display: inline-block;
  transition: transform 0.2s ease;
  margin-left: 4px;
}

#atlas-reference:not(.ar-collapsed) .ar-arrow {
  transform: rotate(180deg);
}

/* ── Body (collapsible) ── */
.ar-body {
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.28s ease, padding 0.28s ease;
  padding: 0;
}

#atlas-reference:not(.ar-collapsed) .ar-body {
  max-height: 900px;
  padding-bottom: 48px;
}

.ar-inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 32px;
}

/* ── Header ── */
.ar-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  padding: 28px 0 24px;
  border-bottom: 1px solid #2e2820;
}

.ar-name {
  font-size: 22px;
  color: #c9a84c;
  margin-bottom: 6px;
  font-weight: normal;
}

.ar-type {
  font-size: 10px;
  letter-spacing: 0.3em;
  color: #8a7a5a;
  text-transform: uppercase;
}

.ar-hr { text-align: right; }

.ar-code {
  font-size: 10px;
  color: #6a5a3a;
  letter-spacing: 0.12em;
  font-family: 'Courier New', monospace;
  margin-bottom: 5px;
}

.ar-address {
  font-size: 17px;
  color: #c9a84c;
  letter-spacing: 0.1em;
  font-family: 'Courier New', monospace;
}

/* ── Tabs ── */
.ar-tabs {
  display: flex;
  border-bottom: 1px solid #2e2820;
  margin-bottom: 20px;
}

.ar-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #7a6a4a;
  font-family: Georgia, serif;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 14px 20px 12px;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.12s, border-color 0.12s;
}

.ar-tab:hover { color: #a89060; }

.ar-tab.active {
  color: #c9a84c;
  border-bottom-color: #c9a84c;
}

/* ── Panels ── */
.ar-panel { min-height: 60px; }
.ar-hidden { display: none; }

/* ── Nearby ── */
.ar-neighbor {
  display: grid;
  grid-template-columns: 40px 1fr auto auto;
  align-items: center;
  gap: 20px;
  padding: 13px 16px;
  border: 1px solid #2e2820;
  margin-bottom: 5px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.12s, background 0.12s;
}

.ar-neighbor:hover {
  border-color: #6a5a3a;
  background: #0e0c09;
}

.ar-n-dir {
  font-size: 11px;
  color: #8a7a5a;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.05em;
}

.ar-n-name {
  font-size: 14px;
  color: #d6c89a;
  transition: color 0.12s;
}

.ar-neighbor:hover .ar-n-name { color: #c9a84c; }

.ar-n-addr {
  font-size: 11px;
  color: #6a5a3a;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.07em;
}

.ar-n-badge {
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #8a7a5a;
  border: 1px solid #3a3020;
  padding: 2px 7px;
}

.ar-empty {
  color: #6a5a3a;
  font-size: 12px;
  font-style: italic;
  letter-spacing: 0.08em;
  padding: 20px 0;
}

/* ── Jump ── */
.ar-jump-row {
  display: flex;
  gap: 10px;
  align-items: stretch;
  margin-top: 4px;
}

.ar-input {
  background: #0d0b0f;
  border: 1px solid #2e2820;
  color: #c9a84c;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  padding: 11px 14px;
  outline: none;
  letter-spacing: 0.06em;
  width: 240px;
  transition: border-color 0.12s;
}

.ar-input:focus { border-color: #7a6a4a; }
.ar-input::placeholder { color: #4a3a28; letter-spacing: 0.03em; }

.ar-btn {
  background: transparent;
  border: 1px solid #6a5a3a;
  color: #c9a84c;
  font-family: Georgia, serif;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 11px 22px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}

.ar-btn:hover {
  border-color: #c9a84c;
  background: rgba(201,168,76,0.07);
}

.ar-btn:disabled { opacity: 0.4; cursor: default; }

.ar-error {
  font-size: 11px;
  color: #9a5a5a;
  margin-top: 8px;
  min-height: 16px;
  font-family: 'Courier New', monospace;
}

/* ── Random ── */
.ar-random-out {
  margin-top: 14px;
  font-size: 13px;
  color: #8a7a5a;
  letter-spacing: 0.1em;
  font-family: 'Courier New', monospace;
  min-height: 20px;
}

/* ── Catalogs ── */
.ar-catalog-link {
  display: block;
  padding: 12px 16px;
  border: 1px solid #2e2820;
  color: #d6c89a;
  text-decoration: none;
  font-size: 13px;
  margin-bottom: 5px;
  transition: border-color 0.12s, color 0.12s;
}

.ar-catalog-link:hover {
  border-color: #6a5a3a;
  color: #c9a84c;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .ar-toggle-bar { padding: 0 16px; }
  .ar-bar-sep-addr, .ar-bar-addr { display: none; }
  .ar-bar-name { max-width: 140px; }
  .ar-inner { padding: 0 16px; }
  .ar-header { flex-direction: column; }
  .ar-hr { text-align: left; }
  .ar-tabs { flex-wrap: wrap; }
  .ar-tab { padding: 10px 14px 8px; font-size: 10px; }
  .ar-neighbor { grid-template-columns: 34px 1fr; }
  .ar-n-addr, .ar-n-badge { display: none; }
  .ar-input { width: 100%; }
  .ar-jump-row { flex-direction: column; }
}
    `;
    document.head.appendChild(s);
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
