import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import Link from "next/link";
import { Search } from "lucide-react";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: { default: "Podcast Radar", template: "%s · Podcast Radar" },
  description: "Weekly intelligence on who to book, what to cover, and who to pitch, from the founder podcasts you follow.",
};

// Runs before paint so a saved dark preference never flashes light. Light is the default.
const THEME_SCRIPT = `try{if(localStorage.getItem("theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

function Mark() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Podcast Radar home">
      <svg viewBox="0 0 28 20" className="h-5 w-7" aria-hidden>
        <rect width="28" height="20" rx="5.5" className="fill-accent" />
        <path d="M11.2 6.1v7.8l6.6-3.9z" fill="#fff" />
      </svg>
      <span className="text-base font-bold tracking-[-0.02em] text-ink">Podcast Radar</span>
    </Link>
  );
}

function SearchBar({ className = "" }: { className?: string }) {
  return (
    <form action="/search" role="search" className={className}>
      <label className="flex h-10 items-center rounded-full border border-line-strong bg-surface pl-4 pr-1.5 transition-colors focus-within:border-info">
        <span className="sr-only">Search guests, topics, brands and episodes</span>
        <input name="q" type="search" autoComplete="off" placeholder="Search guests, topics, brands, episodes…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
        <button type="submit" aria-label="Search" className="grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2">
          <Search className="size-[18px]" strokeWidth={1.75} />
        </button>
      </label>
    </form>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${roboto.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          <div className="flex h-14 items-center gap-4 px-4 md:px-5">
            <Mark />
            <SearchBar className="mx-auto hidden w-full max-w-[560px] md:block" />
            <div className="ml-auto flex items-center gap-1.5 md:ml-0">
              <Link href="/search" aria-label="Search" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2 md:hidden">
                <Search className="size-5" strokeWidth={1.75} />
              </Link>
              <ThemeToggle />
              <span className="ml-1 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-violet-soft text-sm font-medium text-violet" aria-hidden>A</span>
                <span className="hidden text-sm font-medium text-ink lg:block">Aditya</span>
              </span>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] md:hidden" aria-label="Main"><Nav variant="top" /></nav>
        </header>

        <div className="md:grid md:grid-cols-[72px_1fr] 2xl:grid-cols-[232px_1fr]">
          <aside className="hidden border-r border-line bg-surface md:sticky md:top-14 md:flex md:h-[calc(100vh-3.5rem)] md:flex-col md:overflow-y-auto md:px-1 md:py-2 2xl:px-3 2xl:py-3">
            <nav aria-label="Main" className="flex-1"><Nav variant="side" /></nav>
            <p className="hidden px-3 pb-2 pt-6 text-xs leading-relaxed text-ink-3 2xl:block">Every number comes from real episodes on your channels.</p>
          </aside>

          <main className="min-w-0 px-4 pb-20 pt-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
