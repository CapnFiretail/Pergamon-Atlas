(function () {

  // Seeded RNG — deterministic, never uses Math.random()
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Convert hex string (e.g. "B100") to a numeric seed
  function hexToSeed(hex) {
    return parseInt(hex, 16) || 1;
  }

  // Pull last segment from SYSTEM code as the root hex
  // e.g. "SYSTEM-NAV-Z0-Y0-X1-B100" → "B100"
  function extractHex(systemCode) {
    if (!systemCode) return null;
    const parts = systemCode.split('-');
    return parts[parts.length - 1];
  }

  // Deterministic value in [min, max]
  function inRange(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  // Coordinate ranges — change these freely later
  const RANGES = {
    X: { min: 0,    max: 9999 },
    Y: { min: 0,    max: 999  },
    Z: { min: 1,    max: 3    }
  };

  function datestamp() {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = String(now.getFullYear()).slice(-2);
    return m + y;
  }

  // Hash a string (e.g. a URL path) into a stable numeric seed
  function hashPath(str) {
    let h = 0x12345678;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
      h ^= h >>> 16;
    }
    return h >>> 0;
  }

  // Build an ATLAS code from any numeric seed
  function buildCode(seed, chamber) {
    const xStream = mulberry32(seed ^ 0xDEAD);
    const yStream = mulberry32(seed ^ 0xBEEF);
    const zStream = mulberry32(seed ^ 0xCAFE);

    const x = inRange(xStream, RANGES.X.min, RANGES.X.max);
    const y = inRange(yStream, RANGES.Y.min, RANGES.Y.max);
    const z = inRange(zStream, RANGES.Z.min, RANGES.Z.max);

    return `ATLAS-${chamber}-Z${z}-Y${y}-X${x}-${datestamp()}`;
  }

  // For nav/system pages: seed comes from the SYSTEM code hex
  function generate(systemCode, chamber) {
    const hex = extractHex(systemCode);
    if (!hex) return null;
    return buildCode(hexToSeed(hex), chamber);
  }

  // For individual pages: seed comes from the page's unique URL path
  function generateFromPath(path, chamber) {
    return buildCode(hashPath(path), chamber);
  }

  window.atlasGenerator = { generate, generateFromPath };

})();
