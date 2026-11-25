// "Use the Game Library" (Admin Mode, on a page whose cards hold their own details of
// a game): every such card beside what it would show as a reference, each difference
// said, and a choice for each (convert.js). Applying changes the working copy only, as
// one step that Undo takes back, and the page shows the result; Save Draft and Publish
// Changes are the usual ones. A card's picture can be put in its game's record: a
// change to the Game Library's own working copy, saved and published there.
//
// Created by admin.js: convertDialog.create({ workspace, content, artModel(art),
//   records(), live(), reload(), setArtwork(artwork), cardLabel(id), openLibrary(),
//   onChanged(), onForbidden(), returnFocus() })
//   → { open(), isOpen(), destroy() }
(function () {
  'use strict';
  const cms = window.PergamonCMS = window.PergamonCMS || {};
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const CHOICES = { keep: 'Keep as it is', convert: 'Use the game’s details', picture: 'Use the game’s details, with this picture' };
  let uidCount = 0;
  const uid = p => `${p}-${++uidCount}`;

  function create(env) {
    const { workspace, content } = env;
    const PAGE = content.page;
    const overlay = el('div', 'cms-publish cms-convert');
    overlay.hidden = true;
    const dialog = el('div', 'cms-publish-dialog cms-convert-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = el('h2', 'cms-publish-title');
    title.id = uid('cms-convert-title');
    dialog.setAttribute('aria-labelledby', title.id);
    const body = el('div', 'cms-publish-body');
    body.id = uid('cms-convert-body');
    dialog.setAttribute('aria-describedby', body.id);
    const status = el('p', 'cms-publish-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const actions = el('div', 'cms-publish-actions');
    dialog.append(title, body, status, actions);
    overlay.append(dialog);
    document.body.append(overlay);

    let step = null, busy = false;
    let choices = {};
    function button(text, kind, onClick) {
      const b = el('button', kind === 'primary' ? 'cms-drawer-primary' : kind === 'ghost' ? 'cms-drawer-ghost' : 'cms-drawer-secondary', text);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }
    const para = (text, cls) => el('p', cls || '', text);
    function say(text, kind) { status.textContent = text || ''; status.dataset.kind = kind || ''; }
    function show(name, heading, nodes, buttons, focus) {
      step = name;
      dialog.dataset.step = name;
      title.textContent = heading;
      body.replaceChildren(...nodes);
      actions.replaceChildren(...buttons);
      say('');
      const target = focus || dialog;
      if (target === dialog) { dialog.tabIndex = -1; dialog.scrollTop = 0; }
      target.focus();
    }

    function picture(shown, text, square) {
      const fig = el('figure', 'cms-convert-look');
      const box = el('span', 'cms-manage-thumb');
      if (square) box.dataset.square = '';
      const a = shown && shown.art ? env.artModel(shown.art) : null;
      if (a && a.src) {
        const img = el('img');
        img.src = a.src; img.alt = ''; img.decoding = 'async';
        if (a.fit === 'height') { box.dataset.fit = 'height'; if (a.base) box.style.background = a.base; } else if (a.focus) img.style.objectPosition = a.focus;
        box.append(img);
      } else box.append(el('span', 'cms-manage-thumb-empty', 'No image'));
      fig.append(box, el('figcaption', '', text));
      return fig;
    }
    // What each choice would do to the picture, where there is one to decide about.
    function choiceText(card, choice) {
      if (choice !== 'picture') return CHOICES[choice];
      return card.fills ? 'Use the game’s details, and give the game this picture' : 'Use the game’s details, and replace the game’s picture with this one';
    }
    function row(card) {
      const li = el('li', 'cms-convert-row');
      li.dataset.id = card.id;
      const kind = (card.saved ? 'Saved ' + content.cardLabel(card.id, ...workspace.docs()).toLowerCase() : content.cardLabel(card.id, ...workspace.docs()));
      const text = el('div', 'cms-convert-text');
      text.append(el('strong', '', card.before.title), el('span', 'cms-publish-type', kind));
      if (!card.game) {
        text.append(el('span', 'cms-publish-what', `Stays as it is: ${card.before.href} isn’t the page of a game in the Game Library.`));
        li.append(picture(card.before, 'Now', card.slot === 'art'), text);
        return li;
      }
      const list = el('ul', 'cms-history-changes');
      if (!card.differences.length) list.append(el('li', '', 'Nothing visible changes.'));
      card.differences.forEach(d => list.append(el('li', '', `${d.what}: ${d.before} → ${d.after}`)));
      text.append(list);
      const select = el('select', 'cms-field-input');
      select.setAttribute('aria-label', `${card.before.title}, ${kind.toLowerCase()}`);
      cms.convert.offers(card).forEach(c => { const o = el('option', '', choiceText(card, c)); o.value = c; select.append(o); });
      select.value = choices[card.id];
      select.addEventListener('change', () => { choices[card.id] = select.value; count(); });
      text.append(select);
      li.append(picture(card.before, 'Now', card.slot === 'art'), picture(card.after, 'Game Library', card.slot === 'art'), text);
      return li;
    }
    let cards = [], go = null, total = null;
    function count() {
      const on = cards.filter(c => choices[c.id] && choices[c.id] !== 'keep').length;
      total.textContent = `${plural(on, 'card', 'cards')} of ${cards.length} will use the Game Library.`;
      go.disabled = !on;
    }
    function all(pick) { cards.forEach(c => { choices[c.id] = pick(c); }); review(); }

    function review() {
      const rows = el('ul', 'cms-convert-list');
      cards.forEach(c => rows.append(row(c)));
      const matched = cards.filter(c => c.game), differ = matched.filter(c => c.differences.length), pictures = matched.filter(c => cms.convert.offers(c).indexOf('picture') >= 0);
      const bar = el('div', 'cms-convert-all');
      bar.append(el('span', 'cms-admin-label', 'Set all'),
        button('As suggested', 'ghost', () => all(cms.convert.suggested)),
        button('Use the games’ details', 'ghost', () => all(c => (c.game ? 'convert' : 'keep'))));
      if (pictures.length) bar.append(button('… with these pictures', 'ghost', () => all(c => (!c.game ? 'keep' : cms.convert.offers(c).indexOf('picture') >= 0 ? 'picture' : 'convert'))));
      go = button('Apply to my unsaved changes', 'primary', apply);
      total = el('p', 'cms-publish-note');
      const nodes = [
        para(`These cards of the ${PAGE.noun} hold their own copy of a game’s name, link and picture. A card that uses the Game Library keeps its place, its button label and its framing, and takes the rest from the game.`),
        para(!differ.length ? 'Nothing visible changes.' : `${plural(differ.length, 'card differs', 'cards differ')} from the Game Library. Suggested: keep those as they are, except where all that differs is a picture of a kind the game doesn’t have yet.`)
      ];
      if (pictures.length) nodes.push(para('A picture put in the Game Library is a change there: every page that shows the game gets it, and it has to be saved and published in the Game Library too. Publish it before the page, or visitors see the game’s present picture meanwhile.'));
      nodes.push(bar, rows, total);
      show('review', `Use the Game Library on the ${PAGE.noun}`, nodes, [button('Cancel', 'ghost', close), go], step === 'review' ? document.activeElement : null);
      count();
    }

    function apply() {
      const r = cms.convert.apply(workspace.working(), { content, records: env.records(), live: env.live(), choices });
      if (r.problem) { say(r.problem, 'error'); return; }
      if (!content.validateDocument(r.doc) || !workspace.setDocument(r.doc)) { say('These cards couldn’t be converted. Nothing changed.', 'error'); return; }
      const changed = Object.keys(r.artwork).length;
      const put = !changed || env.setArtwork(r.artwork);
      env.onChanged();
      const nodes = [
        para(`${plural(r.converted, 'card', 'cards')} now ${r.converted === 1 ? 'uses' : 'use'} the Game Library in your unsaved changes${r.kept ? `; ${plural(r.kept, 'card was', 'cards were')} kept` : ''}. Nothing is saved or published.`),
        para('Look at the page behind this window, in Admin view. Undo in the panel takes the conversion back in one step.')
      ];
      if (changed) nodes.push(para(put ? `${plural(changed, 'game has', 'games have')} a new picture in your unsaved Game Library changes (undone there, not here). Save and publish the Game Library first.` : 'The pictures couldn’t be put in the Game Library. Undo the conversion, or add them there yourself.', put ? 'cms-publish-note' : 'cms-publish-error'));
      nodes.push(para(`${changed ? 'Then save' : 'Save'} the ${PAGE.noun}’s draft, here or in any card’s editor, and use Publish Changes.`));
      const look = button('Look at the page', 'primary', close);
      const buttons = [look];
      if (changed) buttons.unshift(button('Open Game Library', 'secondary', () => { close(); env.openLibrary(); }));
      buttons.unshift(button('Save Draft', 'secondary', save));
      show('done', 'Not saved yet', nodes, buttons, look);
    }
    async function save() {
      if (busy) return;
      busy = true; say('Saving draft…');
      let r;
      try { r = await workspace.save(); } catch (e) { r = { error: { code: 'network' } }; }
      busy = false;
      env.onChanged();
      if (r.ok) { say('Draft saved. Publish it with Publish Changes in the Admin Mode panel.', 'success'); return; }
      const e = r.error || {};
      if (e.code === 'PT403') env.onForbidden();
      say(r.conflict ? 'Not saved: another administrator saved a newer draft. Use Save Draft in a card’s editor to combine your changes with theirs.'
        : e.code === 'games' || e.code === 'layout' || e.code === 'invalid' ? e.message
        : e.code === 'PT422' ? `The server didn’t accept this: ${e.message}` : 'Couldn’t save the draft. Your changes are still here; try again.', 'error');
    }

    function open() {
      if (!overlay.hidden) return;
      overlay.hidden = false;
      document.documentElement.classList.add('cms-publish-open');
      busy = true;
      show('loading', 'Use the Game Library', [para('Loading the Game Library…')], [button('Cancel', 'ghost', close)]);
      env.reload().then(() => {
        busy = false;
        if (step !== 'loading') return;
        cards = cms.convert.plan(workspace.working(), { content, records: env.records(), live: env.live() });
        if (!Object.keys(env.records()).length) return show('empty', 'The Game Library has no games yet', [para('Create and publish it first; then these cards can use it.')], [button('Close', 'ghost', close), button('Open Game Library', 'primary', () => { close(); env.openLibrary(); })]);
        if (!cards.length) return show('empty', 'Nothing to convert', [para(`Every game card of the ${PAGE.noun} uses the Game Library already.`)], [button('Close', 'secondary', close)]);
        choices = {};
        cards.forEach(c => { choices[c.id] = cms.convert.suggested(c); });
        review();
      }, e => {
        busy = false;
        if (step !== 'loading') return;
        show('failed', 'The Game Library couldn’t be loaded', [para(`Nothing has changed (${(e && e.message) || 'no answer'}).`, 'cms-publish-error')], [button('Close', 'secondary', close)]);
      });
    }
    function close() {
      if (overlay.hidden || (busy && step !== 'loading')) return;
      step = null; busy = false;
      overlay.hidden = true;
      document.documentElement.classList.remove('cms-publish-open');
      env.returnFocus();
    }
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const list = [...dialog.querySelectorAll('button, select')].filter(b => !b.disabled && b.offsetParent !== null);
        if (!list.length) { e.preventDefault(); return; }
        const i = list.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
        else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
      }
    });
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

    return {
      open,
      isOpen: () => !overlay.hidden,
      destroy() { overlay.remove(); document.documentElement.classList.remove('cms-publish-open'); }
    };
  }

  cms.convertDialog = { create };
})();
