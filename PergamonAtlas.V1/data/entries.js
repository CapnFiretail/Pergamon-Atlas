// Games catalog data, hand-maintained.
//
// - path        the game's URL (no trailing slash)
// - visibility  'public' or 'admin'. The Games catalog filters on this via
//               atlas-visibility.js, which also honours admin overrides
//               stored in Supabase (atlas_visibility_overrides).
// - status      'coming-soon' marks a placeholder page; the homepage doesn't
//               count it as playable.
window.atlasEntries = {
  games: [
    { path: "/games/battleship", name: "Battleship", visibility: "public" },
    { path: "/games/blackjack", name: "Blackjack", visibility: "public" },
    { path: "/games/breakout", name: "Breakout", visibility: "public" },
    { path: "/games/chess-forge", name: "Chess Forge", visibility: "public", description: "Play. Learn. Improve. A new way to experience chess on the Atlas." },
    { path: "/games/connect-four", name: "Connect Four", visibility: "public" },
    { path: "/games/pong", name: "Pong", visibility: "public" },
    { path: "/games/snake", name: "Snake", visibility: "public" },
    { path: "/games/tic-tac-toe", name: "Tic Tac Toe", visibility: "public", status: "coming-soon" }
  ]
};
