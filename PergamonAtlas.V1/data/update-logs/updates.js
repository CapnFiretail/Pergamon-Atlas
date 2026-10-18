// Atlas update log — published entries, newest first.
// Fields: date (display, e.g. "October 17, 2026"), iso ("2026-10-17", used for
// sorting and <time datetime>), tag, title, text (summary), list (optional bullets).
const atlasUpdates = [
];

// Stable anchor id for an entry on /updates/ (e.g. #update-2026-05-17-discovered-the-lexicon).
function atlasUpdateId(update) {
  return 'update-' + update.iso + '-' + String(update.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
