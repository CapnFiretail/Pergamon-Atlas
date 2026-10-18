// /account/reset-password/: the page Supabase's password-reset email links to.
// The link signs the visitor into a short-lived recovery session; this page
// only offers the new-password form when it can see that the visit came
// from such a link.
(function () {
  const auth = window.PergamonAuth;
  const views = {
    loading: document.getElementById('reset-loading'),
    form: document.getElementById('reset-form-view'),
    done: document.getElementById('reset-done'),
    invalid: document.getElementById('reset-invalid')
  };
  const form = document.getElementById('reset-form');
  const MIN_PASSWORD = 6;

  function show(name) {
    Object.keys(views).forEach(key => { views[key].hidden = key !== name; });
  }
  function fieldError(input, text) {
    document.getElementById(input.id + '-error').textContent = text || '';
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function status(text, kind) {
    const el = form.querySelector('.account-status');
    el.textContent = text || '';
    el.className = 'account-status' + (kind ? ' ' + kind : '');
  }

  // Evidence this visit came from a reset email: Supabase's URL parameters,
  // or the flag set when another page caught the PASSWORD_RECOVERY event.
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  let fromRecovery = hash.get('type') === 'recovery' || params.has('code');
  try { fromRecovery = fromRecovery || sessionStorage.getItem('pa-password-recovery') === '1'; } catch (e) {}
  const linkError = hash.get('error_description') || params.get('error_description');

  function invalid(text) {
    if (text) document.getElementById('reset-invalid-text').textContent = text;
    show('invalid');
  }

  if (!auth) { invalid("The account service didn't load. Please try again later."); return; }
  if (linkError) { invalid(linkError.replace(/\+/g, ' ') + '. Request a new link below.'); return; }

  let decided = false;
  function decide(session) {
    if (decided) return;
    if (session && fromRecovery) { decided = true; show('form'); form.password.focus(); }
  }
  auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') fromRecovery = true;
    decide(session);
  });
  // supabase-js reads the link's tokens on load; give it a moment, then decide.
  auth.getSession().then(res => decide(res && res.data && res.data.session));
  setTimeout(() => { if (!decided) invalid(); }, 4000);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.busy) return;
    fieldError(form.password, ''); fieldError(form.confirm, ''); status('');
    const password = form.password.value;
    if (password.length < MIN_PASSWORD) fieldError(form.password, `Use at least ${MIN_PASSWORD} characters.`);
    else if (password !== form.confirm.value) fieldError(form.confirm, "The passwords don't match.");
    const bad = form.querySelector('[aria-invalid="true"]');
    if (bad) { bad.focus(); return; }

    const btn = form.querySelector('button[type="submit"]');
    form.dataset.busy = '1'; btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const { error } = await auth.updatePassword(password);
      if (error) {
        const msg = String(error.message || '');
        status(error.status === 429 ? 'Too many attempts. Please wait a minute and try again.'
          : error.code === 'same_password' ? 'Choose a password different from your current one.'
          : !error.status ? "Couldn't reach the account service. Check your connection and try again."
          : msg, 'error');
        return;
      }
      try { sessionStorage.removeItem('pa-password-recovery'); } catch (e) {}
      show('done');
    } catch (err) {
      status("Couldn't reach the account service. Check your connection and try again.", 'error');
    } finally {
      delete form.dataset.busy; btn.disabled = false; btn.textContent = 'Save new password';
      form.password.value = ''; form.confirm.value = '';
    }
  });
})();
