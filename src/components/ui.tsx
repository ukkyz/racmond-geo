"use client";

import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass-card rounded-2xl ${className}`}>{children}</div>;
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">
        {children}
      </h2>
      {hint ? (
        <span className="text-[11px] text-[var(--text-subtle)]">{hint}</span>
      ) : null}
    </div>
  );
}

const fieldBase =
  "glass-input w-full rounded-xl px-3 py-2 text-[13px] outline-none";

export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {hint && !error ? (
        <span className="mt-1 block text-[11px] text-[var(--text-subtle)]">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-rose-500">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${fieldBase} ${className}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`${fieldBase} ${className}`}>
      {children}
    </select>
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const { className = "", ...rest } = props;
  return <textarea {...rest} className={`${fieldBase} ${className}`} />;
}

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-600/25 hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 disabled:opacity-50",
    ghost:
      "glass-card-interactive text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
    danger:
      "bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/25 hover:from-rose-500 hover:to-pink-500",
    subtle:
      "bg-[var(--accent-soft)] text-[var(--accent-text)] border border-[var(--glass-border)] hover:border-[var(--glass-border-strong)]",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?:
    | "slate"
    | "sky"
    | "indigo"
    | "emerald"
    | "amber"
    | "rose"
    | "violet"
    | "fuchsia";
}) {
  const tones: Record<string, string> = {
    slate:
      "bg-purple-500/10 text-[var(--text-secondary)] border-[var(--glass-border)]",
    sky: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30",
    indigo:
      "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30",
    emerald:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    amber:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    violet:
      "bg-violet-500/18 text-violet-700 dark:text-violet-200 border-violet-500/35",
    fuchsia:
      "bg-fuchsia-500/18 text-fuchsia-700 dark:text-fuchsia-200 border-fuchsia-500/35",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10.5px] font-semibold backdrop-blur-md ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
      {label ?? "Loading…"}
    </div>
  );
}
