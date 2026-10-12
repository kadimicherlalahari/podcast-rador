"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

// The <html data-theme> attribute (set before paint by the layout script) is the source of truth.
const read = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light");
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" onClick={() => {
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch { /* private mode: still switches for this visit */ }
    }}
      aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}
      className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
      {theme === "dark" ? <Sun className="size-5" strokeWidth={1.75} /> : <Moon className="size-5" strokeWidth={1.75} />}
    </button>
  );
}
