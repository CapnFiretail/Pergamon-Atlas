// Settings page: display mode and colour palette (see /scripts/theme.js).
// Guests can change the mode; non-default palettes are shown as previews
// with a sign-in prompt instead of selectable options.
(function () {
  var theme = window.PergamonTheme;
  if (!theme) return;

  var modeInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="mode"]'));
  var modeNote = document.getElementById('mode-note');
  var paletteGrid = document.getElementById('palette-grid');
  var paletteNote = document.getElementById('palette-note');
  var paletteCta = document.getElementById('palette-cta');
  var MODE_LABELS = { dark: 'Dark', light: 'Light' };

  modeInputs.forEach(function (input) {
    input.addEventListener('change', function () { if (input.checked) theme.setMode(input.value); });
  });

  function preview(id, mode) {
    return '<span class="palette-preview" data-theme-preview="' + id + '" data-mode="' + mode + '" aria-hidden="true">' +
      '<span class="pp-card"><span class="pp-line"></span><span class="pp-line pp-short"></span><span class="pp-pill"></span></span>' +
      '<span class="pp-swatches"><i class="pp-bg"></i><i class="pp-surface"></i><i class="pp-accent"></i><i class="pp-text"></i></span>' +
    '</span>';
  }

  function renderPalettes(s) {
    paletteGrid.innerHTML = theme.PALETTES.map(function (p) {
      var active = p.id === s.activePalette;
      var locked = !s.signedIn && p.id !== theme.DEFAULT_PALETTE;
      var status = active ? '<span class="palette-status is-active">Active</span>'
        : locked ? '<span class="palette-status">Requires an account</span>' : '';
      if (locked) {
        // A preview, not a control: guests can't pick it.
        return '<div class="palette-option is-locked">' + preview(p.id, s.resolvedMode) +
          '<span class="palette-name">' + p.name + '</span>' + status + '</div>';
      }
      return '<label class="palette-option">' +
        '<input type="radio" name="palette" value="' + p.id + '"' + (active ? ' checked' : '') + '>' +
        preview(p.id, s.resolvedMode) +
        '<span class="palette-name">' + p.name + '</span>' + status + '</label>';
    }).join('');
    paletteGrid.setAttribute('role', 'radiogroup');
    paletteGrid.setAttribute('aria-labelledby', 'palette-heading');
    paletteGrid.querySelectorAll('input[name="palette"]').forEach(function (input) {
      input.addEventListener('change', function () { if (input.checked) theme.setPalette(input.value); });
    });
  }

  function render(s) {
    modeInputs.forEach(function (input) { input.checked = input.value === s.mode; });
    modeNote.textContent = s.mode === 'system'
      ? 'Following your device: currently ' + MODE_LABELS[s.resolvedMode] + '.'
      : '';

    // Keep keyboard focus on the palette that was just chosen across re-render.
    var focused = document.activeElement && document.activeElement.name === 'palette' ? document.activeElement.value : null;
    renderPalettes(s);
    if (focused) {
      var again = paletteGrid.querySelector('input[value="' + focused + '"]');
      if (again) again.focus();
    }

    paletteNote.textContent = s.signedIn
      ? 'Pick any palette. Each one works in dark and light mode.'
      : 'Guests use Obsidian & Gold. The other palettes are available when you sign in.';
    paletteCta.hidden = s.signedIn;
  }

  theme.onChange(render);
  render(theme.get());
})();
