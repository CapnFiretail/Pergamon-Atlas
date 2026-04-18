import { systemNav } from "./navigation.js";

export function getSystemCode() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const entry = systemNav.find(e => e.slug === path);
  if (!entry) return null;
  return `SYSTEM-NAV-Z${entry.z}-Y${entry.y}-X${entry.x}-${entry.hex}`;
}
