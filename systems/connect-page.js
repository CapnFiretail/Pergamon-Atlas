import { systemEntries } from "./entries.js";

export function getSystemCode() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const entry = systemEntries.find(e => e.slug === path);
  if (!entry) return null;
  return `SYSTEM-${entry.type}-Z0-Y0-X0-${entry.hex}`;
}
