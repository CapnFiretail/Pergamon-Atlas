import { systemNav } from "./navigation.js";

export function getSystemCode() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const entry = systemNav.find(e => e.slug === path);
  if (!entry) return null;
  return `SYSTEM-NAV-${entry.z}-${entry.y}-${entry.x}-${entry.hex}`;
}
