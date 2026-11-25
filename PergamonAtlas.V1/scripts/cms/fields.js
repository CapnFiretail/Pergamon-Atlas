// The fields of one component of a document, as a form: the card editor's
// (drawer.js) and the Game Library's (library-dialog.js). Which fields there are
// is content.cardFields; the values are the workspace's working copy, changed as
// they are typed (an invalid value is shown as one and not kept).
//
//   PergamonCMS.fields.create({ form, workspace, content, games, images, imageStore,
//     view, records(), openLibrary(id, from), destinations(id), check(field, value, id),
//     place(field), removeCard(id), onEdit(id), changed(), onForbidden() })
//     form          the element the fields are put in
//     place         … or where in it one goes
//     games         the games a link may lead to: [{ path, name }]
//     records()     the game records a card may refer to, by id
//     destinations  … and, for a record, the pages it may lead to
//     check         a problem beyond content.checkField's, as a sentence, or null
//     removeCard    removes a card whose game is gone; → null when it can't be
//     changed()     a value, a problem or an upload changed
//   → { build(id), fill(), clear(), errors(), hasErrors(), busy(), mark(key, problem),
//       focusFirst() }
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  let uidCount = 0;
  const uid = p => `${p}-${++uidCount}`;
  const OTHER = '__other__';

  function create(env) {
    const { form, workspace, content } = env;
    let current = null;           // the component being edited
    let rows = [];                // [{ field, input, error, counter, other? } | { field, image }]
    let errors = {};              // field key → message
    const records = () => (env.records ? env.records() : {});
    const add = (field, node) => (env.place ? env.place(field) : form).append(node);

    function dropImages() { rows.forEach(r => { if (r.image) r.image.destroy(); }); }
    function clear() { dropImages(); form.replaceChildren(); rows = []; errors = {}; current = null; }

    function imageField(id, field) {
      // The image slot has its own editor (scripts/cms/image-editor.js).
      if (!cms.imageEditor || !env.images) return;
      const image = cms.imageEditor.create({
        field, cardId: id, workspace, content, images: env.images, store: env.imageStore, view: env.view,
        artOf: c => { const shown = content.shownCard({ game: c.game }, content.cardType(id, ...workspace.docs()), records()); return shown.art; },
        commit: cardId => { env.onEdit(cardId); if (cardId === current) env.changed(); },
        setProblem: (key, problem) => { if (problem) errors[key] = problem; else delete errors[key]; env.changed(); },
        busyChanged: () => env.changed(),
        onForbidden: () => env.onForbidden()
      });
      add(field, image.element);
      rows.push({ field, image });
    }

    // A select of places (games, pages) and, for a place not in it, its address.
    function linkInput(row, label, places, other, errorId) {
      const input = el('select', 'cms-field-input');
      const group = el('optgroup'); group.label = 'Games';
      places.forEach(g => { const opt = el('option', '', g.name); opt.value = g.path; group.append(opt); });
      input.append(group);
      if (other) {
        const opt = el('option', '', other); opt.value = OTHER; input.append(opt);
        const node = el('input', 'cms-field-input cms-field-other');
        node.type = 'text'; node.id = uid('cms-field-other'); node.spellcheck = false;
        node.setAttribute('autocomplete', 'off');
        node.setAttribute('aria-label', `${label}: site path`);
        node.setAttribute('aria-describedby', errorId);
        node.placeholder = '/games/';
        row.other = node;
      }
      row.places = places;
      return input;
    }

    function build(id) {
      clear();
      current = id;
      const component = workspace.component(id) || {};
      content.cardFields(id, component, ...workspace.docs()).forEach(field => {
        if (field.type === 'image' || field.type === 'crop') { imageField(id, field); return; }
        const wrap = el('div', 'cms-field');
        const inputId = uid('cms-field'), errorId = uid('cms-field-error');
        const lab = el('label', 'cms-field-label', field.label); lab.htmlFor = inputId;
        const error = el('p', 'cms-field-error'); error.id = errorId; error.hidden = true;
        const row = { field, error };
        let input;
        if (field.type === 'choice') {
          input = el('select', 'cms-field-input');
          field.options.forEach(o => { const opt = el('option', '', o.label || o); opt.value = o.value || o; input.append(opt); });
        } else if (field.type === 'game') {
          input = el('select', 'cms-field-input');
        } else if (field.type === 'link') {
          input = linkInput(row, field.label, env.games, field.gamesOnly ? null : 'Other site page…', errorId);
        } else if (field.type === 'destination') {
          input = linkInput(row, field.label, env.destinations(id), 'Another game page…', errorId);
        } else {
          input = el(field.type === 'textarea' ? 'textarea' : 'input', 'cms-field-input');
          if (field.type !== 'textarea') input.type = 'text';
          input.maxLength = field.max;
          input.setAttribute('autocomplete', 'off');
          const counter = el('span', 'cms-field-count');
          counter.setAttribute('aria-hidden', 'true');
          row.counter = counter;
          lab.append(counter);
        }
        input.id = inputId;
        input.name = field.key;
        input.setAttribute('aria-describedby', errorId);
        row.input = input;
        wrap.append(lab, input);
        if (row.other) wrap.append(row.other);
        if (field.type === 'link') wrap.append(el('p', 'cms-field-hint', field.gamesOnly ? content.linkHint(id, ...workspace.docs()) : 'A game, or another page on this site.'));
        else if (field.hint) wrap.append(el('p', 'cms-field-hint', field.hint));
        if (field.type === 'game') wrap.append(gameNote(row, id));
        wrap.append(error);
        add(field, wrap);
        rows.push(row);

        const onInput = () => apply(row);
        input.addEventListener(input.matches('select') ? 'change' : 'input', onInput);
        if (row.other) row.other.addEventListener('input', onInput);
        const tidy = () => { if (row.counter || row.other) { const t = (row.other && input.value === OTHER ? row.other : input); if (t.value !== t.value.trim()) t.value = t.value.trim(); } };
        input.addEventListener('blur', tidy);
        if (row.other) row.other.addEventListener('blur', tidy);
      });
      fill();
    }

    // ── A card that refers to a game record ──────────────────────────────
    const NOTES = {
      missing: id => `“${id}” isn’t in the Game Library, so visitors don’t see this card. Choose another game${env.removeCard && env.removeCard(current, true) ? ', or remove the card' : ''}.`,
      hidden: () => 'Hidden in the Game Library: visitors don’t see this card.',
      archived: () => 'Archived in the Game Library: visitors don’t see this card.',
      unpublished: () => 'Shown as in your Game Library draft. Visitors see this once the Game Library is published.'
    };
    function gameNote(row) {
      const box = el('div', 'cms-game-ref');
      row.note = el('p', 'cms-game-note');
      const tools = el('div', 'cms-game-tools');
      row.editGame = el('button', 'cms-image-link', 'Edit in Game Library');
      row.editGame.type = 'button';
      row.editGame.addEventListener('click', () => env.openLibrary((workspace.component(current) || {}).game, row.editGame));
      row.dropCard = el('button', 'cms-image-link', 'Remove this card');
      row.dropCard.type = 'button';
      row.dropCard.addEventListener('click', () => env.removeCard(current));
      tools.append(row.editGame, row.dropCard);
      box.append(row.note, tools);
      return box;
    }
    // Listed games first; others only where the card already has one.
    function fillGame(row, id) {
      const all = records(), value = String(id || '');
      const listed = Object.keys(all).filter(k => all[k].availability === 'available' || all[k].availability === 'coming-soon');
      const options = listed.map(k => ({ value: k, label: all[k].name + (all[k].availability === 'coming-soon' ? ' (coming soon)' : '') }));
      if (listed.indexOf(value) < 0) options.push({ value, label: all[value] ? `${all[value].name} (${all[value].availability})` : `${value} (not in the Game Library)` });
      const sign = JSON.stringify(options);
      if (row.sign !== sign) {
        row.sign = sign;
        row.input.replaceChildren(...options.map(o => { const opt = el('option', '', o.label); opt.value = o.value; return opt; }));
      }
      row.input.value = value;
      const note = content.shownCard({ game: value }, null, all).note;
      row.note.textContent = note ? NOTES[note](value) : '';
      row.note.dataset.note = note || '';
      row.editGame.textContent = all[value] ? 'Edit in Game Library' : 'Open Game Library';
      row.dropCard.hidden = note !== 'missing' || !(env.removeCard && env.removeCard(current, true));
    }

    // Working copy → inputs (skips the field being typed in).
    function fill() {
      if (!current) return;
      const component = workspace.component(current) || {};
      rows.forEach(row => {
        if (row.image) { row.image.refresh(); return; }
        const value = typeof component[row.field.key] === 'string' ? component[row.field.key] : '';
        if (row.field.type === 'game') fillGame(row, value);
        else if (row.places) {
          const known = row.places.some(g => g.path === value);
          if (document.activeElement !== row.input) row.input.value = known || !row.other ? value : OTHER;
          if (row.other) {
            row.other.hidden = row.input.value !== OTHER;
            if (document.activeElement !== row.other && row.input.value === OTHER && !errors[row.field.key]) row.other.value = value;
          }
        } else if (document.activeElement !== row.input && !errors[row.field.key]) {
          row.input.value = value;
        }
        if (row.counter) row.counter.textContent = `${row.input.value.trim().length} / ${row.field.max}`;
      });
    }

    function readValue(row) {
      if (row.other) {
        row.other.hidden = row.input.value !== OTHER;
        return (row.input.value === OTHER ? row.other.value : row.input.value).trim();
      }
      return row.input.value.trim();
    }

    // One field changed: check it; valid values go straight into the working copy.
    function apply(row) {
      const value = readValue(row);
      if (row.counter) row.counter.textContent = `${value.length} / ${row.field.max}`;
      const problem = content.checkField(row.field, value) || (env.check ? env.check(row.field, value, current) : null);
      showError(row, problem);
      if (!problem) {
        // Another game is another picture: a framing made for the last one goes with it.
        if (row.field.type === 'game') workspace.setFields(current, { game: value, crop: undefined });
        else workspace.setField(current, row.field.key, value === '' && row.field.optional ? undefined : value);
        env.onEdit(current);
      }
      env.changed(true);
    }

    function showError(row, problem) {
      if (row.image) { if (!problem) row.image.clearProblems(); return; }
      if (problem) errors[row.field.key] = problem; else delete errors[row.field.key];
      row.error.textContent = problem || '';
      row.error.hidden = !problem;
      [row.input, row.other].filter(Boolean).forEach(i => { if (problem) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); });
    }

    return {
      build, fill, clear,
      current: () => current,
      hasErrors: () => Object.keys(errors).length > 0,
      forget: () => rows.forEach(r => showError(r, null)),        // after a discard
      busy: () => rows.some(r => r.image && r.image.busy()),
      mark(key, problem) { const row = rows.find(r => r.field.key === key); if (row) showError(row, problem); },
      focusFirst() { const f = rows.find(r => r.input); if (f) f.input.focus(); }
    };
  }

  cms.fields = { create };
})();
