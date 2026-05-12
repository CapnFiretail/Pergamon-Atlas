#!/usr/bin/env node
// Usage: node archive.js <page-path>
// Example: node archive.js /tools/some-tool
//          node archive.js /games/snake
//          node archive.js /help

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node archive.js <page-path>');
  process.exit(1);
}

const slug     = arg === '/' ? '' : arg.replace(/^\//, '');
const htmlPath = slug
  ? path.join(ROOT, slug, 'index.html')
  : path.join(ROOT, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error(`File not found: ${htmlPath}`);
  process.exit(1);
}

function extractMeta(html) {
  const match = html.match(/<script[^>]+id="atlas-meta"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function injectOrUpdateMeta(html, meta) {
  const json = JSON.stringify(meta, null, 2);
  const tag  = `<script type="application/json" id="atlas-meta">\n${json}\n</script>`;
  if (/<script[^>]+id="atlas-meta"/.test(html)) {
    return html.replace(/<script[^>]+id="atlas-meta"[^>]*>[\s\S]*?<\/script>/, tag);
  }
  return html.replace('<head>', '<head>\n  ' + tag);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

const html     = fs.readFileSync(htmlPath, 'utf-8');
const existing = extractMeta(html);

if (!existing) {
  console.error('No atlas-meta found. Run the indexer on this page first.');
  process.exit(1);
}

if (existing.archived) {
  console.log(`Already archived on ${existing.archive_date}. No changes made.`);
  console.log(`  Address: ATLAS-${existing.address}`);
  process.exit(0);
}

existing.archived     = true;
existing.archive_date = today();

const updated = injectOrUpdateMeta(html, existing);
fs.writeFileSync(htmlPath, updated);

console.log(`✓  Archived: ${arg}`);
console.log(`   Archive date : ${existing.archive_date}`);
console.log(`   Atlas Address: ATLAS-${existing.address}`);
console.log(`   Artifact Code: ${((existing.code_seed ^ existing.seed) >>> 0).toString(16).toUpperCase().padStart(8,'0')}-${existing.address.split('-')[0]}`);
console.log(`   Run indexer to update entries.js`);
