import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { uiStyles } from "@/lib/ui-styles";

export const controlClass = uiStyles.control;
export const textareaClass = `${controlClass} py-3`;

const buttonStyles = uiStyles.button;
export type ButtonVariant = keyof typeof buttonStyles;
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
    />
  );
}
export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 ${buttonStyles[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function PageContainer({
  narrow = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { narrow?: boolean }) {
  return (
    <div
      {...props}
      className={`mx-auto w-full ${narrow ? "max-w-3xl" : "max-w-7xl"} px-4 py-6 sm:px-6 lg:py-8 ${className}`}
    />
  );
}
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-sm font-medium text-fg-3">{eyebrow}</p> : null}
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-fg sm:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[15px] leading-6 text-fg-2">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
export function Surface({
  compact = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { compact?: boolean }) {
  return (
    <section
      {...props}
      className={`rounded-2xl border border-line bg-surface ${compact ? "p-4" : "p-4 sm:p-5"} ${className}`}
    />
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center">
      <h3 className="font-semibold text-fg">{title}</h3>
      <p className="mt-1 text-sm text-fg-2">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
export function InlineNotice({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const style =
    tone === "success"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
      : tone === "info"
        ? "border-blue-400/25 bg-blue-500/10 text-blue-200"
        : "border-red-400/25 bg-red-500/10 text-red-200";
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border p-3 text-sm font-medium ${style}`}
    >
      {children}
    </p>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const style =
    normalized === "completed" || normalized === "success"
      ? "bg-emerald-500/10 text-emerald-300"
      : normalized === "in_progress" || normalized === "active"
        ? "bg-blue-500/10 text-blue-300"
        : normalized === "paused" || normalized === "skipped"
          ? "bg-amber-500/10 text-amber-300"
          : normalized === "cancelled" || normalized === "failed"
            ? "bg-red-500/10 text-red-300"
            : "bg-raised text-fg-2";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
export function LoadingSkeleton({ className = "h-20" }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      className={`animate-pulse rounded-2xl bg-raised motion-reduce:animate-none ${className}`}
    >
      <span className="sr-only">Loading</span>
    </div>
  );
}
