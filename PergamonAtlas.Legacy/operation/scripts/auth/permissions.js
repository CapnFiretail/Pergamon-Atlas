// Pergamon Atlas — permission helpers
//
// Guest is never stored anywhere — it's just "no session". Stored roles are
// only 'user' and 'admin', assigned server-side (see auth.js / the profiles
// migration). These helpers only ever read a role that already came from a
// trusted profile row; they never decide or assign one.

(function () {
  var ACCESS_LABELS = {
    user: 'Member',
    admin: 'Administrator'
  };

  function isGuest(session) {
    return !session;
  }

  function isUser(profile) {
    return !!profile && profile.role === 'user';
  }

  function isAdmin(profile) {
    return !!profile && profile.role === 'admin';
  }

  function getAccessLevelLabel(profile) {
    if (!profile || !profile.role) return 'Guest';
    return ACCESS_LABELS[profile.role] || profile.role;
  }

  window.PergamonPermissions = {
    isGuest,
    isUser,
    isAdmin,
    getAccessLevelLabel
  };
})();
