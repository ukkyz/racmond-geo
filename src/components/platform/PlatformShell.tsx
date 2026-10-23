"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeProvider";

export const PLATFORM_NAV: {
  href: string;
  label: string;
  icon: ReactNode;
}[] = [
  {
    href: "/console",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
        <rect x="10" y="10" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 6.2h1.2a1.5 1.5 0 0 1 1.5 1.5v2.1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    href: "/",
    label: "Fleet",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path d="M10 18s6-4.9 6-9a6 6 0 1 0-12 0c0 4.1 6 9 6 9Z" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="9" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/docker",
    label: "Docker",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <rect x="2.5" y="6.5" width="15" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 6.5v7M10 6.5v7M14 6.5v7" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
        <path d="M5 4.2h10l-1.6 2.3H6.6L5 4.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <circle cx="5" cy="5" r="2.1" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="15" cy="15" r="2.1" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="5" cy="15" r="2.1" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7.1 5h2.4a1.6 1.6 0 0 1 1.6 1.6v3.3M7.1 15h2.4a1.6 1.6 0 0 0 1.6-1.6V10.1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    href: "/apm",
    label: "APM",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path d="M3 16h4l2-6 3 9 2-7 2 4h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/cli",
    label: "CLI",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 8.5 8 10.5 6 12.5M9.5 12.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/agent",
    label: "Agent",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <rect x="5" y="7" width="10" height="9" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10" cy="11.5" r="1.5" fill="currentColor" />
        <path d="M10 4.6V7M8 4.6a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M2.6 12.4h2M15.4 12.4h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/architecture",
    label: "Arch",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <rect x="2.5" y="3" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
        <rect x="11" y="10.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9 6.2h1.1a1.3 1.3 0 0 1 1.3 1.3v2.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
];

export function PlatformNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Platform navigation"
      className="glass-panel sticky top-0 z-50 flex items-center gap-2 border-b px-3 py-2.5"
    >
      <Link
        href="/console"
        className="flex flex-none items-center gap-2.5 rounded-xl px-2 py-1.5"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-500 shadow-md shadow-purple-600/35">
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-white" fill="none">
            <rect x="3" y="3" width="14" height="5" rx="1.2" fill="currentColor" />
            <rect x="3" y="10" width="14" height="5" rx="1.2" fill="currentColor" opacity="0.72" />
            <circle cx="6" cy="5.5" r="0.9" fill="#2e1065" />
            <circle cx="6" cy="12.5" r="0.9" fill="#2e1065" />
          </svg>
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[13.5px] font-bold tracking-tight text-[var(--text-primary)]">
            Racmond
          </span>
          <span className="block text-[10px] text-[var(--text-muted)]">
            ops platform
          </span>
        </span>
      </Link>

      <div className="thin-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {PLATFORM_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`nav-item whitespace-nowrap ${active ? "nav-item-active" : ""}`}
            >
              {item.icon}
              {!compact ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </div>

      <ThemeToggle compact />
    </nav>
  );
}

export function PlatformShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformNav />
      <main className="thin-scroll mx-auto w-full max-w-[1600px] flex-1 overflow-y-auto p-4 lg:p-6">
        {children}
      </main>
    </div>
  );
}

/** Consistent header used by every platform module page. */
export function ModuleHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-text)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[20px] font-bold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-[13px] text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
