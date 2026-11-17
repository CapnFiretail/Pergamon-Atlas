// atlas.js — shared footer loader for Pergamon Atlas pages
// Usage: loadSnippets('Page Name') at the bottom of each page.
//
// V1 pages render the header and sidebar inline (see /scripts/nav.js), so the
// only shared snippet left is the footer. The pageName argument is kept so
// existing call sites don't need to change.

function loadSnippets(pageName) {
  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (!footerPlaceholder) return;

  fetch('/operation/snippets/footer.html')
    .then(r => r.text())
    .then(html => { footerPlaceholder.innerHTML = html; });
}
