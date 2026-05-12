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

    const PA = window.PergamonAddress;
    const all = (typeof window.atlasEntries !== 'undefined')
      ? [
          ...window.atlasEntries.tools,
          ...window.atlasEntries.games,
          ...(window.atlasEntries.pages || [])
        ]
      : [];
    const allArchived = (typeof window.atlasEntries !== 'undefined')
      ? (window.atlasEntries.archived || [])
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

    const typeMap  = { TL: 'Tool', GM: 'Game', AR: 'Archive', PG: 'Page' };
    const typeName = typeMap[chamber] || chamber;

    const codeSeed   = meta.code_seed || 0;
    const fixedVal   = (codeSeed ^ seed) >>> 0;
    const fixedHex   = fixedVal.toString(16).toUpperCase().padStart(8, '0');
    const dynSegment = address.split('-')[0] || '?????';
    const artCode    = `${fixedHex}-${dynSegment}`;

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

    const othersActive   = all.filter(e => e.path !== currentPath);
    const othersArchived = allArchived.filter(e => e.path !== currentPath);
    const othersAll      = [...othersActive, ...othersArchived];
    const seen           = new Set();
    const neighbors      = [];

    for (const dir of DIRS) {
      const px = coords.x + dir.dx * STEP;
      const py = coords.y + dir.dy * STEP;
      const pz = coords.z + dir.dz * STEP;

      let closest = null, closestDist = Infinity;
      for (const e of othersAll) {
        const d = hypot3(e.coords.x, e.coords.y, e.coords.z, px, py, pz);
        if (d < closestDist) { closestDist = d; closest = e; }
      }

      if (closest && !seen.has(closest.path)) {
        seen.add(closest.path);
        neighbors.push({ dir: dir.label, artifact: closest, trace: !!closest.archived });
      }
    }

    // ── Inject ───────────────────────────────────────────────────────────

    injectStyles();

    if (meta.archived) {
      const section = buildArchivedSection({ name, artCode, address, meta });
      const footer = document.getElementById('footer-placeholder');
      if (footer) footer.parentNode.insertBefore(section, footer);
      else document.body.appendChild(section);
      updateSidebarDisplay(address);
      return;
    }

    // ── Catalogs ─────────────────────────────────────────────────────────

    const catalogs = [];
    if (chamber === 'TL') catalogs.push({ name: 'Tools Catalog', path: '/tools' });
    if (chamber === 'GM') catalogs.push({ name: 'Games Catalog', path: '/games' });

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
      el.textContent = 'ATLAS-' + address;
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
          <span class="ar-bar-addr">ATLAS-${esc(address)}</span>
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
            </div>
            <div class="ar-hr">
              <div class="ar-meta-label">Artifact Code</div>
              <div class="ar-code">${esc(artCode)}</div>
              <div class="ar-meta-label" style="margin-top:10px">Atlas Address</div>
              <div class="ar-address">ATLAS-${esc(address)}</div>
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
    const jumpS1  = el.querySelector('#ar-jump-s1');
    const jumpS2  = el.querySelector('#ar-jump-s2');
    const jumpS3  = el.querySelector('#ar-jump-s3');
    const jumpBtn = el.querySelector('#ar-jump-btn');
    const jumpErr = el.querySelector('#ar-jump-error');

    function doJump() {
      const raw = (jumpS1.value + '-' + jumpS2.value + '-' + jumpS3.value).trim().toUpperCase();
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
    [jumpS1, jumpS2, jumpS3].forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') doJump(); });
    });

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
      } else {
        randomOut.textContent = 'No artifacts in catalog.';
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
      if (n.trace) {
        return `
        <div class="ar-neighbor ar-neighbor-trace">
          <span class="ar-n-arrow">→</span>
          <span class="ar-n-name ar-n-trace-name">${esc(n.artifact.name)}</span>
          <span class="ar-n-addr">${n.artifact.address ? 'ATLAS-' + esc(n.artifact.address) : '—'}</span>
        </div>`;
      }
      return `
        <a class="ar-neighbor" href="${esc(n.artifact.path)}">
          <span class="ar-n-arrow">→</span>
          <span class="ar-n-name">${esc(n.artifact.name)}</span>
          <span class="ar-n-addr">${n.artifact.address ? 'ATLAS-' + esc(n.artifact.address) : '—'}</span>
        </a>`;
    }).join('');
  }

  function buildArchivedSection({ name, artCode, address, meta }) {
    const el = document.createElement('section');
    el.id = 'atlas-reference';
    el.classList.add('ar-archived');

    el.innerHTML = `
      <div class="ar-toggle-bar">
        <div class="ar-bar-inner">
          <span class="ar-bar-wordmark">Pergamon Atlas</span>
          <span class="ar-bar-sep">·</span>
          <span class="ar-bar-name ar-archived-label">ARCHIVED ARTIFACT</span>
          <span class="ar-bar-sep ar-bar-sep-addr">·</span>
          <span class="ar-bar-addr">ATLAS-${esc(address)}</span>
          <button class="ar-toggle-btn" aria-label="Toggle Archive Record">
            Archive Record <span class="ar-arrow">▾</span>
          </button>
        </div>
      </div>

      <div class="ar-body">
        <div class="ar-inner">
          <div class="ar-arc-marker">// COMPRESSED EXISTENCE //</div>
          <div class="ar-arc-name">${esc(name)}</div>
          <div class="ar-arc-grid">
            <div class="ar-arc-field"><span class="ar-af-key">ARTIFACT CODE</span><span class="ar-af-val">${esc(artCode)}</span></div>
            <div class="ar-arc-field"><span class="ar-af-key">ATLAS ADDRESS</span><span class="ar-af-val">ATLAS-${esc(address)}</span></div>
            <div class="ar-arc-field"><span class="ar-af-key">REGISTERED</span><span class="ar-af-val">${meta.date || '—'}${meta.time ? ' · ' + meta.time + ' UTC' : ''}</span></div>
            <div class="ar-arc-field"><span class="ar-af-key">ARCHIVED</span><span class="ar-af-val">${meta.archive_date || '—'}</span></div>
            <div class="ar-arc-field"><span class="ar-af-key">ORIGINAL CHAMBER</span><span class="ar-af-val">${meta.chamber || '—'} → AR</span></div>
            <div class="ar-arc-field"><span class="ar-af-key">STATUS</span><span class="ar-af-val">COMPRESSED</span></div>
          </div>
          <p class="ar-arc-note">This artifact has collapsed into the Archives. Its address and identity are preserved. It no longer participates in active Atlas navigation.</p>
          <a class="ar-arc-catalog-link" href="/archives">← View Archives Catalog</a>
        </div>
      </div>
    `;

    el.querySelector('.ar-toggle-bar').addEventListener('click', () => {
      el.classList.toggle('ar-collapsed');
    });

    return el;
  }

  function buildJumpPanel() {
    return `
      <div class="ar-jump-label">Enter Atlas Address</div>
      <div class="ar-jump-row">
        <input id="ar-jump-s1" class="ar-input ar-seg" type="text" maxlength="5" placeholder="XXXXX"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z2-9]/g,'');if(this.value.length===5)document.getElementById('ar-jump-s2').focus()">
        <span class="ar-seg-sep">·</span>
        <input id="ar-jump-s2" class="ar-input ar-seg" type="text" maxlength="5" placeholder="XXXXX"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z2-9]/g,'');if(this.value.length===5)document.getElementById('ar-jump-s3').focus()">
        <span class="ar-seg-sep">·</span>
        <input id="ar-jump-s3" class="ar-input ar-seg" type="text" maxlength="5" placeholder="XXXXX"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z2-9]/g,'')">
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
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 0;
}

.ar-bar-wordmark {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #8a7a5a;
  text-transform: uppercase;
  white-space: nowrap;
}

.ar-bar-sep {
  color: #4a4030;
  font-size: 14px;
}

.ar-bar-name {
  font-size: 14px;
  color: #c9a84c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

.ar-bar-addr {
  font-size: 13px;
  color: #7a6a4a;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.ar-bar-sep-addr { flex-shrink: 0; }

.ar-toggle-btn {
  margin-left: auto;
  background: transparent;
  border: 1px solid #3a3020;
  color: #8a7a5a;
  font-family: Georgia, serif;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 7px 16px;
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
  margin-left: 6px;
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
  max-height: 2000px;
  padding-bottom: 52px;
}

.ar-inner {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 32px;
}

/* ── Header ── */
.ar-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  padding: 28px 0 22px;
  border-bottom: 1px solid #2e2820;
}

.ar-name {
  font-size: 24px;
  color: #c9a84c;
  margin-bottom: 6px;
  font-weight: normal;
}

.ar-hr { text-align: right; }

.ar-meta-label {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #7a6a4a;
  text-transform: uppercase;
  font-family: 'Courier New', monospace;
  margin-bottom: 5px;
}

.ar-code {
  font-size: 14px;
  color: #c9a84c;
  letter-spacing: 0.1em;
  font-family: 'Courier New', monospace;
  font-weight: bold;
}

.ar-address {
  font-size: 18px;
  color: #c9a84c;
  letter-spacing: 0.08em;
  font-family: 'Courier New', monospace;
}

/* ── Tabs ── */
.ar-tabs {
  display: flex;
  border-bottom: 1px solid #2e2820;
  margin-top: 24px;
  margin-bottom: 22px;
  gap: 4px;
}

.ar-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #8a7a5a;
  font-family: Georgia, serif;
  font-size: 13px;
  letter-spacing: 0.06em;
  padding: 12px 18px 10px;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.12s, border-color 0.12s;
  white-space: nowrap;
}

.ar-tab:hover { color: #b09060; }

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
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid #272218;
  border-radius: 4px;
  margin-bottom: 6px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.12s, background 0.12s;
}

.ar-neighbor:hover {
  border-color: #6a5a3a;
  background: #0e0c09;
}

.ar-n-arrow {
  font-size: 15px;
  color: #7a6a4a;
}

.ar-n-name {
  font-size: 15px;
  color: #d6c89a;
  transition: color 0.12s;
}

.ar-neighbor:hover .ar-n-name { color: #c9a84c; }

.ar-n-addr {
  font-size: 12px;
  color: #7a6a4a;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.05em;
}

.ar-empty {
  color: #7a6a4a;
  font-size: 14px;
  font-style: italic;
  padding: 20px 0;
}

/* ── Jump ── */
.ar-jump-label {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #7a6a4a;
  text-transform: uppercase;
  font-family: 'Courier New', monospace;
  margin-bottom: 10px;
  margin-top: 6px;
}

.ar-jump-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.ar-seg {
  width: 86px;
  text-align: center;
  flex: none;
}

.ar-seg-sep {
  color: #5a4a38;
  font-size: 16px;
  font-family: 'Courier New', monospace;
  flex-shrink: 0;
}

.ar-input {
  background: #0d0b0f;
  border: 1px solid #2e2820;
  border-radius: 3px;
  color: #c9a84c;
  font-family: 'Courier New', monospace;
  font-size: 15px;
  padding: 10px 12px;
  outline: none;
  letter-spacing: 0.06em;
  transition: border-color 0.12s;
}

.ar-input:focus { border-color: #7a6a4a; }
.ar-input::placeholder { color: #3a2e20; }

.ar-btn {
  background: transparent;
  border: 1px solid #6a5a3a;
  border-radius: 3px;
  color: #c9a84c;
  font-family: Georgia, serif;
  font-size: 13px;
  letter-spacing: 0.08em;
  padding: 10px 22px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  white-space: nowrap;
}

.ar-btn:hover {
  border-color: #c9a84c;
  background: rgba(201,168,76,0.07);
}

.ar-btn:disabled { opacity: 0.4; cursor: default; }

.ar-error {
  font-size: 12px;
  color: #9a5a5a;
  margin-top: 8px;
  min-height: 18px;
  font-family: 'Courier New', monospace;
}

/* ── Random ── */
.ar-random-out {
  margin-top: 16px;
  font-size: 14px;
  color: #8a7a5a;
  letter-spacing: 0.08em;
  font-family: 'Courier New', monospace;
  min-height: 20px;
}

/* ── Catalogs ── */
.ar-catalog-link {
  display: block;
  padding: 13px 16px;
  border: 1px solid #272218;
  border-radius: 4px;
  color: #d6c89a;
  text-decoration: none;
  font-size: 15px;
  margin-bottom: 6px;
  transition: border-color 0.12s, color 0.12s;
}

.ar-catalog-link:hover {
  border-color: #6a5a3a;
  color: #c9a84c;
}

/* ── Archived artifact panel ── */
.ar-archived .ar-toggle-bar { border-bottom-color: #1e1208; }
.ar-archived-label {
  color: #9a5a2a !important;
  font-size: 12px !important;
  letter-spacing: 0.15em !important;
  text-transform: uppercase;
}

.ar-arc-marker {
  font-size: 11px;
  letter-spacing: 0.35em;
  color: #4a2a14;
  font-family: 'Courier New', monospace;
  padding: 28px 0 18px;
  text-transform: uppercase;
}
.ar-arc-name {
  font-size: 22px;
  color: #8a6a3a;
  font-family: 'Courier New', monospace;
  margin-bottom: 22px;
  letter-spacing: 0.03em;
}
.ar-arc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 32px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #1e1208;
}
.ar-arc-field { display: flex; flex-direction: column; gap: 5px; }
.ar-af-key {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #5a3a1a;
  text-transform: uppercase;
  font-family: 'Courier New', monospace;
}
.ar-af-val {
  font-size: 14px;
  color: #8a6a3a;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.05em;
}
.ar-arc-note {
  font-size: 13px;
  color: #5a3a20;
  line-height: 1.8;
  margin-bottom: 18px;
  font-style: italic;
}
.ar-arc-catalog-link {
  font-size: 12px;
  color: #6a4a22;
  text-decoration: none;
  letter-spacing: 0.12em;
  font-family: 'Courier New', monospace;
  text-transform: uppercase;
  transition: color 0.12s;
  padding-bottom: 48px;
  display: inline-block;
}
.ar-arc-catalog-link:hover { color: #c9a84c; }

/* ── Archive traces in nearby panel ── */
.ar-neighbor-trace {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid #1a1008;
  border-radius: 4px;
  margin-bottom: 6px;
  opacity: 0.45;
  cursor: default;
  user-select: none;
}
.ar-n-trace-name {
  font-size: 14px;
  color: #5a4a30;
  font-style: italic;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .ar-toggle-bar { padding: 0 16px; }
  .ar-bar-sep-addr, .ar-bar-addr { display: none; }
  .ar-bar-name { max-width: 160px; }
  .ar-inner { padding: 0 16px; }
  .ar-header { flex-direction: column; }
  .ar-hr { text-align: left; }
  .ar-tabs { flex-wrap: wrap; gap: 0; }
  .ar-tab { font-size: 12px; padding: 10px 12px 8px; }
  .ar-neighbor { grid-template-columns: 28px 1fr; }
  .ar-n-addr { display: none; }
  .ar-seg { width: 60px; }
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
