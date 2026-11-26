"use client";

import { useEffect, useId, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FormDrawerSize = "md" | "lg" | "xl";

const SIZE_CLASSES: Record<FormDrawerSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

/**
 * Viewport-independent slide-over drawer rendered into document.body via React Portal.
 * Guarantees the form header and action footer (Save / Cancel) stay permanently pinned
 * inside the viewport regardless of how long the background list or the form itself is.
 */
export function FormDrawer({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  size = "lg",
  onSubmit,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  size?: FormDrawerSize;
  /** When provided, body and footer are wrapped in a single semantic <form>. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const content = (
    <div
      className="fixed inset-0 z-[100] flex h-dvh w-dvw items-stretch justify-end bg-ink-950/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Backdrop click target */}
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar painel"
        onClick={onClose}
      />

      {/* Drawer panel — strictly bounded to 100dvh */}
      <div
        className={`relative z-10 flex h-dvh max-h-dvh w-full ${SIZE_CLASSES[size]} flex-col overflow-hidden bg-sand-50 shadow-2xl animate-drawer-in`}
      >
        {/* Pinned Header */}
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-sand-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="font-ui text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">
                {eyebrow}
              </p>
            ) : null}
            <h3 id={titleId} className="truncate text-lg font-semibold text-ink-900 sm:text-xl">
              {title}
            </h3>
            {subtitle ? (
              <p className="font-ui mt-0.5 text-xs text-stone-500">{subtitle}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Independently Scrollable Body + Permanently Pinned Footer */}
        {onSubmit ? (
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-sand-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
                {footer}
              </div>
            ) : null}
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-sand-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
                {footer}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
