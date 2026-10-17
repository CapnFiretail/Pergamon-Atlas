// GET /api/frameable?url=https://example.com/page
// Reports whether a page may be shown inside an <iframe> on pergamonatlas.com,
// by reading its X-Frame-Options and CSP frame-ancestors response headers.
// Only headers are inspected; the page body is never returned.

const dns = require('dns').promises;
const net = require('net');

const ATLAS_ORIGINS = ['https://pergamonatlas.com', 'https://www.pergamonatlas.com'];
const MAX_REDIRECTS = 5;

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') ||
    (v6.startsWith('::ffff:') && isPrivateAddress(v6.slice(7)));
}

async function assertPublicHost(url) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol');
  if (url.username || url.password) throw new Error('credentials in url');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) throw new Error('private host');
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('private host');
}

// True when the frame-ancestors source list admits pergamonatlas.com.
function ancestorsAllowAtlas(list) {
  const sources = list.trim().split(/\s+/).filter(Boolean);
  if (!sources.length || sources.includes("'none'")) return false;
  return sources.some(src => {
    if (src === '*') return true;
    if (src === 'https:' || src === 'https://*') return true;
    return ATLAS_ORIGINS.some(origin => {
      if (src.replace(/\/$/, '') === origin) return true;
      if (!src.includes('*')) return false;
      const pattern = '^' + src.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$';
      return new RegExp(pattern).test(origin);
    });
  });
}

function frameableFromHeaders(headers) {
  const xfo = (headers.get('x-frame-options') || '').trim().toLowerCase();
  if (xfo === 'deny' || xfo === 'sameorigin') return false;

  const csp = headers.get('content-security-policy') || '';
  const directive = csp.split(/[;,]/).map(d => d.trim()).find(d => /^frame-ancestors\b/i.test(d));
  if (directive) return ancestorsAllowAtlas(directive.replace(/^frame-ancestors/i, ''));
  return true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  let url;
  try { url = new URL(String(req.query.url || '')); }
  catch { return res.status(400).json({ error: 'invalid url' }); }

  try {
    // Follow redirects by hand so every hop is checked against private addresses.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url);
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; PergamonAtlas frame check)', accept: 'text/html,*/*' },
      });
      if (response.body) response.body.cancel().catch(() => {});

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      // An http:// page inside the https:// Atlas is blocked as mixed content.
      if (url.protocol !== 'https:') return res.status(200).json({ url: url.href, frameable: false, reason: 'not https' });
      return res.status(200).json({ url: url.href, frameable: frameableFromHeaders(response.headers) });
    }
    return res.status(200).json({ url: url.href, frameable: false, reason: 'too many redirects' });
  } catch (err) {
    // Unreachable or refused: let the page fall back to opening a new tab.
    return res.status(200).json({ url: url.href, frameable: false, reason: String(err.message || err) });
  }
};

module.exports.frameableFromHeaders = frameableFromHeaders;
