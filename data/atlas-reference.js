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

  /** Default neighbor thumbnail; entries may set `thumb` for a custom URL. */
  var AR_NEIGHBOR_THUMB = '/data/atlas-neighbor-thumb.svg';

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    const metaEl = document.getElementById('atlas-meta');
    if (!metaEl) return;

    let meta;
    try { meta = JSON.parse(metaEl.textContent); }
    catch { return; }

    const PA = window.PergamonAddress;
    const rawAll = (typeof window.atlasEntries !== 'undefined')
      ? [
          ...window.atlasEntries.tools,
          ...window.atlasEntries.games,
          ...(window.atlasEntries.chess_forge || []),
          ...(window.atlasEntries.pages || [])
        ]
      : [];
    const rawArchived = (typeof window.atlasEntries !== 'undefined')
      ? (window.atlasEntries.archived || [])
      : [];

    // Public Atlas Navigation must only ever perceive publicly visible
    // entries — Nearby, Jump to Address, Random Jump, and the Catalogs tab
    // all read from `all`/`allArchived` below, so filtering once here
    // closes all of those surfaces at a single point. Admin Public Preview
    // resolves to the exact same filtered set as a guest/user; Admin View
    // sees everything, unfiltered. Archived entries are entirely excluded
    // from the public universe regardless of any visibility tag.
    const all = window.PergamonVisibility
      ? await window.PergamonVisibility.getVisibleEntries(rawAll)
      : rawAll;
    const allArchived = window.PergamonVisibility
      ? await window.PergamonVisibility.getVisibleEntries(rawArchived)
      : rawArchived;

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
    if (chamber === 'CF') catalogs.push({ name: 'Chess Forge', path: '/chess-forge' });

    const section = buildSection({
      name, artCode, typeName, address, neighbors, catalogs, PA, all, allArchived
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

  function buildSection({ name, artCode, typeName, address, neighbors, catalogs, PA, all, allArchived }) {
    const el = document.createElement('section');
    el.id = 'atlas-reference';

    el.innerHTML = `
      <div class="ar-bar">
        <div class="ar-bar-inner">
          <div class="ar-bar-left">
            <span class="ar-bar-logo" aria-hidden="true">
              <svg class="ar-bar-logo-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="1.2"/><path d="M10 20c2-6 4-10 6-12 2 2 4 6 6 12M13 14h6M12 18h8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M11 22h10l-1.5 4h-7L11 22z" stroke="currentColor" stroke-width="1" fill="none"/></svg>
            </span>
            <span class="ar-bar-wordmark">PERGAMON ATLAS</span>
            <span class="ar-bar-slash">/</span>
            <span class="ar-bar-name">${esc(name)}</span>
            <span class="ar-bar-slash">/</span>
            <span class="ar-bar-addr-crumb">ATLAS-${esc(address)}</span>
          </div>
          <div class="ar-bar-right">
            <button type="button" class="ar-bar-ref-btn" aria-haspopup="menu" aria-expanded="false">
              <span>ATLAS NAVIGATION</span>
              <svg class="ar-bar-chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="ar-body">
        <div class="ar-inner">

          <div class="ar-header">
            <div class="ar-hl">
              <div class="ar-name">${esc(name)}</div>
              <div class="ar-desc">Explore verified artifact locations, view curated catalogs, and navigate across the Pergamon Atlas.</div>
            </div>
            <div class="ar-hr">
              <div class="ar-info-card">
                <div class="ar-info-row">
                  <span class="ar-info-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>
                  </span>
                  <div class="ar-info-text">
                    <div class="ar-meta-label">Artifact code</div>
                    <div class="ar-code">${esc(artCode)}</div>
                  </div>
                </div>
                <div class="ar-info-row ar-info-row-divider">
                  <span class="ar-info-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5" fill="currentColor" stroke="none"/></svg>
                  </span>
                  <div class="ar-info-text">
                    <div class="ar-meta-label">Atlas address</div>
                    <div class="ar-address">ATLAS-${esc(address)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <nav class="ar-tabs" role="tablist">
            <button class="ar-tab active" data-tab="nearby" role="tab" aria-selected="true">
              <span class="ar-tab-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/><polygon points="12,7 14,12 12,17 10,12" fill="currentColor" stroke="none"/><line x1="12" y1="4" x2="12" y2="6"/></svg></span>
              <span class="ar-tab-txt">Explore nearby</span>
            </button>
            <button class="ar-tab" data-tab="jump" role="tab" aria-selected="false">
              <span class="ar-tab-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></span>
              <span class="ar-tab-txt">Jump to address</span>
            </button>
            <button class="ar-tab" data-tab="random" role="tab" aria-selected="false">
              <span class="ar-tab-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor"/><circle cx="16.5" cy="16.5" r="1" fill="currentColor"/></svg></span>
              <span class="ar-tab-txt">Random jump</span>
            </button>
            <button class="ar-tab" data-tab="catalogs" role="tab" aria-selected="false">
              <span class="ar-tab-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg></span>
              <span class="ar-tab-txt">View catalogs</span>
            </button>
          </nav>

          <div class="ar-panels-shell">
            <div class="ar-panel" id="ar-panel-nearby">${buildNearbyPanel(neighbors)}</div>
            <div class="ar-panel ar-hidden" id="ar-panel-jump">${buildJumpPanel()}</div>
            <div class="ar-panel ar-hidden" id="ar-panel-random">${buildRandomPanel()}</div>
            <div class="ar-panel ar-hidden" id="ar-panel-catalogs">${buildCatalogsPanel(catalogs)}</div>
          </div>

        </div>
      </div>
    `;

    // Collapse toggle
    const refBtn = el.querySelector('.ar-bar-ref-btn');
    const body   = el.querySelector('.ar-body');
    el.classList.add('ar-collapsed');
    refBtn.setAttribute('aria-expanded', 'false');

    refBtn.addEventListener('click', () => {
      const collapsed = el.classList.toggle('ar-collapsed');
      refBtn.setAttribute('aria-expanded', String(!collapsed));
    });

    // Tab switching
    el.querySelectorAll('.ar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.ar-tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        el.querySelectorAll('.ar-panel').forEach(p => p.classList.add('ar-hidden'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
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
        const target = [...all, ...allArchived].find(e => e.address === raw);
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

  function neighborThumbSrc(artifact) {
    if (artifact && artifact.thumb) return String(artifact.thumb);
    return AR_NEIGHBOR_THUMB;
  }

  function buildNearbyPanel(neighbors) {
    if (!neighbors.length) {
      return `<p class="ar-empty">No artifacts detected in adjacent space.</p>`;
    }
    const intro = `
      <div class="ar-nearby-intro">
        <span class="ar-nearby-compass" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="12,6 14.2,12 12,18 9.8,12" fill="currentColor" stroke="none"/><line x1="12" y1="3" x2="12" y2="5.5"/></svg>
        </span>
        <div class="ar-nearby-intro-text">
          <div class="ar-nearby-title">Nearby Atlas</div>
          <div class="ar-nearby-sub">Discover and navigate to neighboring atlas entries.</div>
        </div>
      </div>`;
    const rows = neighbors.map(n => {
      const initials = n.artifact.name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '??';
      const thumb = esc(neighborThumbSrc(n.artifact));
      if (n.trace) {
        return `
        <div class="ar-neighbor ar-neighbor-trace">
          <div class="ar-n-thumb ar-n-thumb-trace">
            <img class="ar-n-thumb-img" src="${thumb}" alt="" loading="lazy" onerror="this.classList.add('ar-n-thumb-img--err');"/>
            <span class="ar-n-thumb-fallback" aria-hidden="true">${initials}</span>
          </div>
          <div class="ar-n-info">
            <div class="ar-n-name ar-n-trace-name">${esc(n.artifact.name)}</div>
            <div class="ar-n-addr">${n.artifact.address ? 'ATLAS-' + esc(n.artifact.address) : '—'}</div>
          </div>
        </div>`;
      }
      return `
        <a class="ar-neighbor" href="${esc(n.artifact.path)}">
          <div class="ar-n-thumb">
            <img class="ar-n-thumb-img" src="${thumb}" alt="" loading="lazy" onerror="this.classList.add('ar-n-thumb-img--err');"/>
            <span class="ar-n-thumb-fallback" aria-hidden="true">${initials}</span>
          </div>
          <div class="ar-n-info">
            <div class="ar-n-name">${esc(n.artifact.name)}</div>
            <div class="ar-n-addr">${n.artifact.address ? 'ATLAS-' + esc(n.artifact.address) : '—'}</div>
          </div>
          <span class="ar-n-view">VIEW ATLAS →</span>
        </a>`;
    }).join('');
    return intro + rows;
  }

  function buildArchivedSection({ name, artCode, address, meta }) {
    const el = document.createElement('section');
    el.id = 'atlas-reference';
    el.classList.add('ar-archived');

    el.innerHTML = `
      <div class="ar-bar ar-bar-archived">
        <div class="ar-bar-inner">
          <div class="ar-bar-left">
            <span class="ar-bar-logo" aria-hidden="true">
              <svg class="ar-bar-logo-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="1.2"/><path d="M10 20c2-6 4-10 6-12 2 2 4 6 6 12M13 14h6M12 18h8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M11 22h10l-1.5 4h-7L11 22z" stroke="currentColor" stroke-width="1" fill="none"/></svg>
            </span>
            <span class="ar-bar-wordmark">PERGAMON ATLAS</span>
            <span class="ar-bar-slash">/</span>
            <span class="ar-bar-name ar-archived-label">ARCHIVED ARTIFACT</span>
            <span class="ar-bar-slash">/</span>
            <span class="ar-bar-addr-crumb">ATLAS-${esc(address)}</span>
          </div>
          <div class="ar-bar-right">
            <button type="button" class="ar-bar-ref-btn ar-bar-ref-btn--archive" aria-haspopup="menu" aria-expanded="false">
              <span>ARCHIVE RECORD</span>
              <svg class="ar-bar-chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>
            </button>
          </div>
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

    return el;
  }

  function buildJumpPanel() {
    return `
      <div class="ar-jump-label">Enter Atlas Address</div>
      <div class="ar-jump-row">
        <input id="ar-jump-s1" class="ar-input ar-seg" type="text" maxlength="5" placeholder="XXXXX"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z2-9]/g,'');if(this.value.length===5)document.getElementById('ar-jump-s2').focus()">
        <span class="ar-seg-sep">-</span>
        <input id="ar-jump-s2" class="ar-input ar-seg" type="text" maxlength="5" placeholder="XXXXX"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z2-9]/g,'');if(this.value.length===5)document.getElementById('ar-jump-s3').focus()">
        <span class="ar-seg-sep">-</span>
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
      `<a class="ar-catalog-link" href="${esc(c.path)}">${esc(c.name)} →</a>`
    ).join('');
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('ar-styles')) return;
    const s = document.createElement('style');
    s.id = 'ar-styles';
    s.textContent = `
#atlas-reference {
  --ar-gold: #c5a059;
  --ar-muted: #888888;
  --ar-bg: #0a0a0a;
  --ar-line: rgba(197, 160, 89, 0.35);
  background: var(--ar-bg);
  border-top: 1px solid var(--ar-line);
  font-family: Georgia, "Times New Roman", serif;
  color: #d4d0c8;
  margin-top: 0;
}

/* ── Top bar ── */
.ar-bar {
  border-bottom: 1px solid var(--ar-line);
  padding: 0 32px;
}

.ar-bar-inner {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
}

.ar-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
}

.ar-bar-logo {
  color: var(--ar-gold);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.ar-bar-logo-svg {
  width: 22px;
  height: 22px;
  display: block;
}

.ar-bar-wordmark {
  font-size: 13px;
  letter-spacing: 0.12em;
  color: var(--ar-gold);
  text-transform: uppercase;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.ar-bar-slash {
  color: #555;
  font-size: 13px;
  flex-shrink: 0;
}

.ar-bar-name {
  font-size: 15px;
  color: #c4c0b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ar-bar-addr-crumb {
  font-size: 13px;
  color: var(--ar-muted);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.ar-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.ar-bar-ref-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ar-muted);
  background: transparent;
  border: 1px solid var(--ar-gold);
  border-radius: 2px;
  padding: 7px 12px 7px 14px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.ar-bar-ref-btn:hover {
  color: var(--ar-gold);
  background: rgba(197, 160, 89, 0.08);
}

.ar-bar-chevron {
  width: 10px;
  height: 7px;
  flex-shrink: 0;
  opacity: 0.85;
}

/* ── Body ── */
.ar-body {
  overflow: hidden;
  max-height: 2000px;
  transition: max-height 0.3s ease, padding 0.3s ease;
  padding-bottom: 52px;
}

#atlas-reference.ar-collapsed .ar-body {
  max-height: 0;
  padding-bottom: 0;
}

#atlas-reference.ar-collapsed .ar-bar-chevron {
  transform: rotate(180deg);
}

.ar-bar-chevron {
  transition: transform 0.2s ease;
}

.ar-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 32px;
}

/* ── Header ── */
.ar-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 32px;
  padding: 32px 0 26px;
  border-bottom: 1px solid var(--ar-line);
}

.ar-hl { flex: 1; min-width: 0; }

.ar-name {
  font-size: 28px;
  color: var(--ar-gold);
  margin-bottom: 10px;
  font-weight: normal;
  line-height: 1.2;
  font-family: Georgia, "Times New Roman", serif;
}

.ar-desc {
  font-size: 14px;
  color: #c8c4bc;
  line-height: 1.7;
  max-width: 480px;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
}

.ar-hr {
  flex-shrink: 0;
}

.ar-info-card {
  min-width: 260px;
  max-width: 340px;
  border: 1px solid var(--ar-gold);
  border-radius: 2px;
  background:
    radial-gradient(circle at 50% 45%, rgba(197, 160, 89, 0.06) 0%, transparent 55%),
    repeating-conic-gradient(from 0deg at 50% 55%, transparent 0deg 8deg, rgba(197, 160, 89, 0.03) 8deg 9deg),
    #0c0c0c;
  padding: 4px 0;
}

.ar-info-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 18px;
}

.ar-info-row-divider {
  border-top: 1px solid var(--ar-line);
}

.ar-info-icon {
  color: var(--ar-gold);
  flex-shrink: 0;
  margin-top: 2px;
}

.ar-info-icon svg {
  width: 22px;
  height: 22px;
  display: block;
}

.ar-info-text { min-width: 0; }

.ar-meta-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--ar-muted);
  text-transform: uppercase;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  margin-bottom: 6px;
}

.ar-code {
  font-size: 14px;
  color: var(--ar-gold);
  letter-spacing: 0.06em;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-weight: 600;
}

.ar-address {
  font-size: 13px;
  color: var(--ar-gold);
  letter-spacing: 0.05em;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
}

/* ── Tabs ── */
.ar-tabs {
  display: flex;
  align-items: stretch;
  margin-top: 26px;
  margin-bottom: 0;
  gap: 0;
}

.ar-tab {
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--ar-muted);
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 14px 18px 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 8px;
  border-left: 1px solid var(--ar-line);
}

.ar-tab:first-child {
  border-left: none;
  padding-left: 0;
}

.ar-tab-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.ar-tab-ico svg {
  width: 18px;
  height: 18px;
  display: block;
}

.ar-tab:hover {
  color: #b6a878;
}

.ar-tab.active {
  color: var(--ar-gold);
  border-bottom-color: var(--ar-gold);
}

.ar-tab.active .ar-tab-ico {
  color: var(--ar-gold);
}

/* ── Panel shell ── */
.ar-panels-shell {
  border: 1px solid var(--ar-gold);
  padding: 22px 22px 26px;
  margin-top: 0;
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.2);
}

.ar-panel { min-height: 48px; }
.ar-hidden { display: none !important; }

/* ── Nearby intro ── */
.ar-nearby-intro {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 4px 0 18px;
}

.ar-nearby-compass {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 1px solid var(--ar-gold);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ar-gold);
  background: rgba(197, 160, 89, 0.06);
}

.ar-nearby-compass svg {
  width: 22px;
  height: 22px;
}

.ar-nearby-intro-text {
  min-width: 0;
}

.ar-nearby-title {
  font-size: 17px;
  color: var(--ar-gold);
  margin-bottom: 4px;
  font-family: Georgia, "Times New Roman", serif;
}

.ar-nearby-sub {
  font-size: 13px;
  color: var(--ar-muted);
  line-height: 1.5;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
}

/* ── Neighbor rows ── */
.ar-neighbor {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: #0e0e0e;
  border: 1px solid var(--ar-line);
  border-radius: 2px;
  margin-bottom: 10px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, background 0.15s;
}

.ar-neighbor:hover {
  border-color: rgba(197, 160, 89, 0.55);
  background: #111;
}

.ar-n-thumb {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border: 1px solid var(--ar-line);
  border-radius: 2px;
  overflow: hidden;
  background: #141414;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ar-n-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ar-n-thumb-img--err {
  display: none !important;
}

.ar-n-thumb-fallback {
  display: none;
  position: absolute;
  inset: 0;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  color: var(--ar-muted);
  letter-spacing: 0.06em;
}

.ar-n-thumb:has(.ar-n-thumb-img--err) .ar-n-thumb-fallback {
  display: flex;
}

.ar-n-thumb-trace {
  opacity: 0.45;
}

.ar-n-info {
  flex: 1;
  min-width: 0;
}

.ar-n-name {
  font-size: 16px;
  color: var(--ar-gold);
  margin-bottom: 4px;
  transition: opacity 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: Georgia, "Times New Roman", serif;
}

.ar-neighbor:hover .ar-n-name {
  opacity: 0.92;
}

.ar-n-addr {
  font-size: 12px;
  color: var(--ar-muted);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  letter-spacing: 0.04em;
}

.ar-n-view {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--ar-muted);
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  white-space: nowrap;
  flex-shrink: 0;
  border: 1px solid var(--ar-gold);
  padding: 8px 14px;
  border-radius: 2px;
  text-transform: uppercase;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.ar-neighbor:hover .ar-n-view {
  color: var(--ar-gold);
  background: rgba(197, 160, 89, 0.08);
}

.ar-n-trace-name {
  font-size: 14px;
  color: #666;
  font-style: italic;
  font-family: Georgia, serif;
}

.ar-neighbor-trace {
  opacity: 0.55;
  cursor: default;
  pointer-events: none;
}

.ar-empty {
  color: var(--ar-muted);
  font-size: 14px;
  font-style: italic;
  padding: 20px 0;
  font-family: system-ui, sans-serif;
}

/* ── Jump ── */
.ar-jump-label {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ar-muted);
  text-transform: uppercase;
  font-family: system-ui, sans-serif;
  margin-bottom: 12px;
  margin-top: 4px;
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
  color: #555;
  font-size: 18px;
  font-family: ui-monospace, Consolas, monospace;
  flex-shrink: 0;
}

.ar-input {
  background: #0e0e0e;
  border: 1px solid var(--ar-line);
  border-radius: 2px;
  color: var(--ar-gold);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 14px;
  padding: 10px 12px;
  outline: none;
  letter-spacing: 0.06em;
  transition: border-color 0.15s;
}

.ar-input:focus { border-color: var(--ar-gold); }
.ar-input::placeholder { color: #444; }

.ar-btn {
  background: transparent;
  border: 1px solid var(--ar-gold);
  border-radius: 2px;
  color: var(--ar-gold);
  font-family: system-ui, sans-serif;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 10px 20px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  white-space: nowrap;
}

.ar-btn:hover {
  border-color: var(--ar-gold);
  background: rgba(197, 160, 89, 0.1);
}

.ar-btn:disabled { opacity: 0.4; cursor: default; }

.ar-error {
  font-size: 12px;
  color: #c08080;
  margin-top: 10px;
  min-height: 18px;
  font-family: ui-monospace, Consolas, monospace;
}

/* ── Random ── */
.ar-random-out {
  margin-top: 16px;
  font-size: 14px;
  color: var(--ar-muted);
  letter-spacing: 0.06em;
  font-family: ui-monospace, Consolas, monospace;
  min-height: 20px;
}

/* ── Catalogs ── */
.ar-catalog-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: #0e0e0e;
  border: 1px solid var(--ar-line);
  border-radius: 2px;
  color: #d4d0c8;
  text-decoration: none;
  font-size: 15px;
  margin-bottom: 8px;
  transition: border-color 0.15s, color 0.15s;
  font-family: system-ui, sans-serif;
}

.ar-catalog-link:hover {
  border-color: rgba(197, 160, 89, 0.55);
  color: var(--ar-gold);
}

/* ── Archived panel ── */
.ar-bar-archived .ar-bar-logo { color: #9a7a4a; }
.ar-bar-archived .ar-bar-wordmark { color: #9a7a4a; }
.ar-bar-archived .ar-bar-name { color: #a08050; }
.ar-bar-archived .ar-bar-addr-crumb { color: #777; }

.ar-bar-ref-btn--archive {
  border-color: rgba(197, 160, 89, 0.45);
  color: #777;
}

.ar-archived-label { color: #a08050 !important; }

.ar-arc-marker {
  font-size: 11px;
  letter-spacing: 0.28em;
  color: #555;
  font-family: ui-monospace, Consolas, monospace;
  padding: 28px 0 18px;
  text-transform: uppercase;
}

.ar-arc-name {
  font-size: 22px;
  color: var(--ar-gold);
  font-family: Georgia, serif;
  margin-bottom: 22px;
  letter-spacing: 0.02em;
}

.ar-arc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 32px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--ar-line);
}

.ar-arc-field { display: flex; flex-direction: column; gap: 5px; }

.ar-af-key {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--ar-muted);
  text-transform: uppercase;
  font-family: system-ui, sans-serif;
}

.ar-af-val {
  font-size: 14px;
  color: var(--ar-gold);
  font-family: ui-monospace, Consolas, monospace;
  letter-spacing: 0.04em;
}

.ar-arc-note {
  font-size: 13px;
  color: #777;
  line-height: 1.8;
  margin-bottom: 18px;
  font-style: italic;
  font-family: system-ui, sans-serif;
}

.ar-arc-catalog-link {
  font-size: 11px;
  color: var(--ar-muted);
  text-decoration: none;
  letter-spacing: 0.12em;
  font-family: system-ui, sans-serif;
  text-transform: uppercase;
  transition: color 0.15s;
  padding-bottom: 48px;
  display: inline-block;
}

.ar-arc-catalog-link:hover { color: var(--ar-gold); }

/* ── Responsive ── */
@media (max-width: 700px) {
  .ar-bar { padding: 0 16px; }
  .ar-bar-addr-crumb { display: none; }
  .ar-bar-name { max-width: 120px; }
  .ar-inner { padding: 0 16px; }
  .ar-header { flex-direction: column; gap: 20px; }
  .ar-info-card { min-width: unset; max-width: none; width: 100%; }
  .ar-tabs { flex-wrap: wrap; }
  .ar-tab {
    font-size: 9px;
    padding: 10px 12px 8px;
    border-left: none;
    border-bottom: 1px solid var(--ar-line);
    flex: 1 1 42%;
  }
  .ar-tab:first-child { padding-left: 12px; }
  .ar-panels-shell { padding: 16px; }
  .ar-n-view { display: none; }
  .ar-n-addr { display: none; }
  .ar-seg { width: 64px; }
  .ar-arc-grid { grid-template-columns: 1fr; }
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
