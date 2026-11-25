// The Atlas Navigation widget's title and links, the same on every page that has one
// (scripts/page-widgets.js). Not CMS content yet. A link may set `signedInLabel` and
// `signedInDescription` for signed-in visitors; icons: scripts/components/atlas-navigation.js.
window.PergamonAtlasNavigation = {
  title: 'Atlas Navigation',
  links: [
    { label: 'Login / Sign Up', signedInLabel: 'Account', description: 'Sign in or create an account', signedInDescription: 'Your profile and sign-in details', href: '/account/', icon: 'account' },
    { label: 'Settings', description: 'Display mode and colour palette', href: '/settings/', icon: 'settings' },
    { label: 'Update Log', description: 'What’s new on PergamonAtlas', href: '/updates/', icon: 'updates' },
    { label: 'Suggestions', description: 'Share an idea with us', href: '/suggestions/', icon: 'suggestions' }
  ]
};
