"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Database,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { AccessibleDialog } from "@/components/ui/accessible-dialog";
import { Button } from "@/components/ui/button";
import { getAppTranslations } from "@/lib/i18n";

export interface PrivacyTrustBadgeStripProps {
  className?: string;
  compact?: boolean;
  onOpenPrivacyModal?: () => void;
}

/**
 * Compact privacy and trust summary strip shown on the welcome screen
 * and at the bottom of the dashboard.
 */
export function PrivacyTrustBadgeStrip({
  className = "",
  compact = false,
  onOpenPrivacyModal,
}: PrivacyTrustBadgeStripProps) {
  const { lang } = useAppPreferences();
  const t = getAppTranslations(lang).privacyStrip;

  return (
    <section
      aria-label={t.ariaLabel}
      className={`rounded-xl border border-emerald-500/25 bg-emerald-500/5 text-left ${
        compact ? "p-4" : "p-5"
      } ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-4 shrink-0" />
          <span>{t.title}</span>
        </div>
        {onOpenPrivacyModal ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onOpenPrivacyModal}
          >
            <Lock className="size-3" />
            {t.manageDataButton}
          </Button>
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t.introBeforePolicy}
        <strong className="font-medium text-foreground">
          {t.introPolicyName}
        </strong>
        {t.introAfterPolicy}
      </p>

      <ul
        className={`mt-3 grid gap-2 text-xs text-muted-foreground ${
          compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"
        }`}
      >
        <li className="flex items-start gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <strong className="font-medium text-foreground">
              {t.bullets.neverSold.label}
            </strong>{" "}
            {t.bullets.neverSold.text}
          </span>
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <strong className="font-medium text-foreground">
              {t.bullets.noAi.label}
            </strong>{" "}
            {t.bullets.noAi.text}
          </span>
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2">
          <Database className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <strong className="font-medium text-foreground">
              {t.bullets.localMetadata.label}
            </strong>{" "}
            {t.bullets.localMetadata.text}
          </span>
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2">
          <KeyRound className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <strong className="font-medium text-foreground">
              {t.bullets.revocable.label}
            </strong>{" "}
            {t.bullets.revocable.text}
          </span>
        </li>
      </ul>
    </section>
  );
}

export interface PrivacySettingsModalProps {
  userEmail?: string | null;
  onClose: () => void;
  onDisconnectComplete: () => Promise<void> | void;
}

/**
 * Modal detailing local metadata storage, OAuth permissions, Google API Limited Use
 * compliance, and an explicit action to wipe local cache & disconnect Google OAuth.
 */
export function PrivacySettingsModal({
  userEmail,
  onClose,
  onDisconnectComplete,
}: PrivacySettingsModalProps) {
  const { lang } = useAppPreferences();
  const t = getAppTranslations(lang).privacyModal;

  const [confirmChecked, setConfirmChecked] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDisconnect() {
    if (!confirmChecked || isDisconnecting) {
      return;
    }

    setIsDisconnecting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/account/disconnect", {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as {
        disconnected?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.disconnected) {
        setErrorMessage(payload?.error ?? t.disconnectFailedError);
        setIsDisconnecting(false);
        return;
      }

      await onDisconnectComplete();
    } catch {
      setErrorMessage(t.disconnectNetworkError);
      setIsDisconnecting(false);
    }
  }

  return (
    <AccessibleDialog
      open
      onClose={() => {
        if (!isDisconnecting) {
          onClose();
        }
      }}
      ariaLabelledBy="privacy-settings-title"
      closeOnEscape={!isDisconnecting}
      closeOnBackdropClick={!isDisconnecting}
      zIndexClassName="z-50"
      overlayClassName="p-4"
      contentClassName="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h2
                id="privacy-settings-title"
                className="text-base font-semibold"
              >
                {t.title}
              </h2>
              <p className="text-xs text-muted-foreground">
                {userEmail
                  ? t.connectedSubtitle(userEmail)
                  : t.defaultSubtitle}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.closeAriaLabel}
            disabled={isDisconnecting}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5 text-xs leading-relaxed">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Database className="size-4 text-primary" />
              <h3>{t.storedSectionTitle}</h3>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">
                  {t.storedItems.metadata.label}
                </strong>{" "}
                {t.storedItems.metadata.text}
              </li>
              <li>
                <strong className="text-foreground">
                  {t.storedItems.keepSafe.label}
                </strong>{" "}
                {t.storedItems.keepSafe.text}
              </li>
              <li>
                <strong className="text-foreground">
                  {t.storedItems.autoClean.label}
                </strong>{" "}
                {t.storedItems.autoClean.text}
              </li>
              <li>
                <strong className="text-foreground">
                  {t.storedItems.oauth.label}
                </strong>{" "}
                {t.storedItems.oauth.text}
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRound className="size-4 text-primary" />
              <h3>{t.oauthSectionTitle}</h3>
            </div>
            <p className="mt-2 text-muted-foreground">{t.oauthParagraph1}</p>
            <p className="mt-2 text-muted-foreground">
              {t.oauthParagraph2BeforePolicy}
              <strong className="text-foreground">{t.oauthPolicyName}</strong>
              {t.oauthParagraph2AfterPolicy}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <h3 className="text-sm font-semibold text-destructive">
                  {t.disconnectTitle}
                </h3>
                <p className="mt-1 text-muted-foreground">
                  {t.disconnectDescription}
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-destructive/30 bg-background/80 p-3 select-none">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(event) => setConfirmChecked(event.target.checked)}
                disabled={isDisconnecting}
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-destructive"
              />
              <span className="text-foreground">{t.confirmCheckboxLabel}</span>
            </label>

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDisconnecting}
                onClick={onClose}
              >
                {t.cancelButton}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                disabled={!confirmChecked || isDisconnecting}
                onClick={() => void handleDisconnect()}
              >
                {isDisconnecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {isDisconnecting ? t.disconnectingButton : t.disconnectButton}
              </Button>
            </div>
          </div>
        </div>
    </AccessibleDialog>
  );
}
