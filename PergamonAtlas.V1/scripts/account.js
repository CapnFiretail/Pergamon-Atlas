// Account page: sign in, create account, password recovery and the signed-in
// view, all through window.PergamonAuth (Supabase). Nothing here stores or
// logs credentials; password fields are cleared after every attempt.
(function () {
  const auth = window.PergamonAuth;
  const panel = document.querySelector('.account-panel');
  const views = {
    loading: document.getElementById('account-loading'),
    guest: document.getElementById('account-guest'),
    forgot: document.getElementById('account-forgot'),
    member: document.getElementById('account-member')
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MIN_PASSWORD = 6;

  function show(name) {
    Object.keys(views).forEach(key => { views[key].hidden = key !== name; });
    panel.dataset.state = name === 'forgot' ? 'guest' : name;
  }

  // ?next=/some/path — only same-site paths, never another origin.
  function safeNext() {
    const next = new URLSearchParams(window.location.search).get('next');
    if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
    return next;
  }

  // ── Messages ──────────────────────────────────────────────────────────
  function status(form, text, kind) {
    const el = form.querySelector('.account-status');
    el.textContent = text || '';
    el.className = 'account-status' + (kind ? ' ' + kind : '');
  }
  function fieldError(input, text) {
    const el = document.getElementById(input.id + '-error');
    if (el) el.textContent = text || '';
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function clearErrors(form) {
    form.querySelectorAll('input').forEach(input => fieldError(input, ''));
    status(form, '');
  }
  function focusFirstInvalid(form) {
    const bad = form.querySelector('[aria-invalid="true"]');
    if (bad) bad.focus();
    return !!bad;
  }

  // Maps Supabase auth errors to plain messages.
  function describe(error, action) {
    const code = error && (error.code || '');
    const msg = String((error && error.message) || '').toLowerCase();
    const st = error && error.status;
    if (st === 429 || code.includes('rate_limit') || msg.includes('rate limit')) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Email or password is incorrect.';
    if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Please confirm your email address first — check your inbox for the link.';
    if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) return 'An account with this email already exists. Try signing in instead.';
    if (code === 'weak_password' || msg.includes('password should')) return error.message;
    if (code === 'signup_disabled') return 'New accounts are not being accepted right now.';
    if (code === 'same_password') return 'Choose a password different from your current one.';
    if (!st || error.name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') || msg.includes('network')) {
      return "Couldn't reach the account service. Check your connection and try again.";
    }
    return (action || 'That') + " didn't work: " + (error.message || 'unknown error') + '.';
  }

  // One request at a time per form; the button shows progress.
  async function run(form, pendingLabel, task) {
    if (form.dataset.busy) return;
    const btn = form.querySelector('button[type="submit"]');
    const label = btn.textContent;
    form.dataset.busy = '1';
    form.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    btn.textContent = pendingLabel;
    try {
      await task();
    } catch (err) {
      status(form, describe(err), 'error');
    } finally {
      delete form.dataset.busy;
      form.removeAttribute('aria-busy');
      btn.disabled = false;
      btn.textContent = label;
      form.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
    }
  }

  // ── Tabs (arrow keys, Home, End) ──────────────────────────────────────
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(selected, focus) {
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
    document.querySelectorAll('#account-guest form').forEach(clearErrors);
    if (focus) selected.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) { event.preventDefault(); selectTab(next, true); }
    });
  });

  // ── Signed-in view ────────────────────────────────────────────────────
  function formatDate(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  }
  function renderMember(session, profile) {
    document.getElementById('member-name').textContent = (profile && profile.display_name) || '—';
    document.getElementById('member-email').textContent = session.user.email || '—';
    document.getElementById('member-address').textContent = profile && profile.atlas_address ? 'ATLAS-' + profile.atlas_address : '—';
    document.getElementById('member-access').textContent = window.PergamonPermissions ? window.PergamonPermissions.getAccessLevelLabel(profile) : '—';
    document.getElementById('member-since').textContent = formatDate(profile && profile.created_at);
    show('member');
  }

  async function refresh() {
    try {
      const result = await auth.getCurrentUserAndProfile();
      if (result.session) renderMember(result.session, result.profile);
      else showGuest();
    } catch (err) {
      showGuest();
    }
  }

  function showGuest() {
    if (window.location.hash === '#forgot-password') {
      show('forgot');
    } else {
      show('guest');
      if (window.location.hash === '#create-account') selectTab(tabs[1]);
    }
  }

  // After signing in/up: go to ?next= if given, otherwise show the account.
  async function signedIn() {
    const next = safeNext();
    if (next) { window.location.assign(next); return; }
    await refresh();
  }

  // ── Sign in ───────────────────────────────────────────────────────────
  const signInForm = document.getElementById('sign-in-form');
  signInForm.addEventListener('submit', event => {
    event.preventDefault();
    clearErrors(signInForm);
    const email = signInForm.email.value.trim();
    const password = signInForm.password.value;
    if (!EMAIL_RE.test(email)) fieldError(signInForm.email, email ? 'Enter a valid email address.' : 'Enter your email.');
    if (!password) fieldError(signInForm.password, 'Enter your password.');
    if (focusFirstInvalid(signInForm)) return;

    run(signInForm, 'Signing in…', async () => {
      const { error } = await auth.signIn({ email, password });
      if (error) { status(signInForm, describe(error, 'Sign in'), 'error'); return; }
      await signedIn();
    });
  });

  // ── Create account ────────────────────────────────────────────────────
  const createForm = document.getElementById('create-account-form');
  createForm.addEventListener('submit', event => {
    event.preventDefault();
    clearErrors(createForm);
    const displayName = createForm.name.value.trim();
    const email = createForm.email.value.trim();
    const password = createForm.password.value;
    if (!displayName) fieldError(createForm.name, 'Choose a display name.');
    if (!EMAIL_RE.test(email)) fieldError(createForm.email, email ? 'Enter a valid email address.' : 'Enter your email.');
    if (password.length < MIN_PASSWORD) fieldError(createForm.password, `Use at least ${MIN_PASSWORD} characters.`);
    if (focusFirstInvalid(createForm)) return;

    run(createForm, 'Creating account…', async () => {
      const { data, error } = await auth.signUp({ email, password, displayName });
      if (error) { status(createForm, describe(error, 'Creating your account'), 'error'); return; }
      if (data && data.session) { await signedIn(); return; }
      // Email confirmation is required by the project: no session yet.
      status(createForm, 'Account created. Check your email for a link to confirm it, then sign in.', 'success');
    });
  });

  // ── Password recovery ─────────────────────────────────────────────────
  const forgotForm = document.getElementById('forgot-form');
  document.getElementById('forgot-link').addEventListener('click', event => {
    event.preventDefault();
    history.replaceState(null, '', '#forgot-password');
    clearErrors(forgotForm);
    forgotForm.email.value = signInForm.email.value.trim();
    show('forgot');
    forgotForm.email.focus();
  });
  document.getElementById('back-to-sign-in').addEventListener('click', event => {
    event.preventDefault();
    history.replaceState(null, '', window.location.pathname + window.location.search);
    show('guest');
    selectTab(tabs[0]);
    signInForm.email.focus();
  });
  forgotForm.addEventListener('submit', event => {
    event.preventDefault();
    clearErrors(forgotForm);
    const email = forgotForm.email.value.trim();
    if (!EMAIL_RE.test(email)) fieldError(forgotForm.email, email ? 'Enter a valid email address.' : 'Enter your email.');
    if (focusFirstInvalid(forgotForm)) return;

    run(forgotForm, 'Sending…', async () => {
      const { error } = await auth.sendPasswordReset(email, window.location.origin + '/account/reset-password/');
      if (error) { status(forgotForm, describe(error, 'Sending the reset link'), 'error'); return; }
      status(forgotForm, 'If an account exists for ' + email + ', a reset link is on its way. It may take a few minutes to arrive.', 'success');
    });
  });

  // ── Sign out ──────────────────────────────────────────────────────────
  document.getElementById('sign-out-btn').addEventListener('click', async function () {
    const memberStatus = document.getElementById('member-status');
    this.disabled = true;
    memberStatus.textContent = '';
    try {
      const { error } = await auth.signOut();
      if (error) throw error;
      showGuest();
    } catch (err) {
      memberStatus.textContent = describe(err, 'Signing out');
      memberStatus.className = 'account-status error';
    } finally {
      this.disabled = false;
    }
  });

  // ── Start ─────────────────────────────────────────────────────────────
  if (!auth) {
    views.loading.textContent = "Accounts are unavailable right now — the sign-in service didn't load. Please try again later.";
    return;
  }
  auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
      // Supabase sent the reset link here instead of the reset page.
      try { sessionStorage.setItem('pa-password-recovery', '1'); } catch (e) {}
      window.location.replace('/account/reset-password/');
    }
    if (event === 'SIGNED_OUT') showGuest();
  });
  refresh();
})();
