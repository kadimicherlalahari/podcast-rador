import { AudioLines, PlaySquare, Rss } from "lucide-react";

export function SourceIcons({ yt, rss, spotify }: { yt: unknown; rss: unknown; spotify?: unknown }) {
  const items = [
    yt && { icon: PlaySquare, label: "YouTube" },
    rss && { icon: Rss, label: "RSS feed" },
    spotify && { icon: AudioLines, label: "Spotify" },
  ].filter(Boolean) as { icon: typeof Rss; label: string }[];
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-3">
      {items.map(({ icon: Icon, label }) => (
        <span key={label} title={label} className="inline-flex"><Icon className="size-4" strokeWidth={1.75} aria-label={label} /></span>
      ))}
    </span>
  );
}
