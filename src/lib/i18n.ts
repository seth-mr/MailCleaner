export const APP_LANGUAGES = ["en", "es"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const APP_THEMES = ["dark", "light"] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const DEFAULT_APP_LANGUAGE: AppLanguage = "en";
export const DEFAULT_APP_THEME: AppTheme = "dark";

export function isAppLanguage(value: unknown): value is AppLanguage {
  return (
    typeof value === "string" &&
    (APP_LANGUAGES as readonly string[]).includes(value)
  );
}

export function isAppTheme(value: unknown): value is AppTheme {
  return (
    typeof value === "string" &&
    (APP_THEMES as readonly string[]).includes(value)
  );
}

export function getIntlLocale(lang: AppLanguage): string {
  return lang === "es" ? "es-MX" : "en-US";
}

export interface AppTranslations {
  controls: {
    themeGroupLabel: string;
    switchToLight: string;
    switchToDark: string;
    darkLabel: string;
    lightLabel: string;
    languageGroupLabel: string;
    switchToEnglish: string;
    switchToSpanish: string;
  };
  privacyStrip: {
    ariaLabel: string;
    title: string;
    manageDataButton: string;
    introBeforePolicy: string;
    introPolicyName: string;
    introAfterPolicy: string;
    bullets: {
      neverSold: { label: string; text: string };
      noAi: { label: string; text: string };
      localMetadata: { label: string; text: string };
      revocable: { label: string; text: string };
    };
  };
  privacyModal: {
    title: string;
    connectedSubtitle: (email: string) => string;
    defaultSubtitle: string;
    closeAriaLabel: string;
    storedSectionTitle: string;
    storedItems: {
      metadata: { label: string; text: string };
      keepSafe: { label: string; text: string };
      autoClean: { label: string; text: string };
      oauth: { label: string; text: string };
    };
    oauthSectionTitle: string;
    oauthParagraph1: string;
    oauthParagraph2BeforePolicy: string;
    oauthPolicyName: string;
    oauthParagraph2AfterPolicy: string;
    disconnectTitle: string;
    disconnectDescription: string;
    confirmCheckboxLabel: string;
    cancelButton: string;
    disconnectingButton: string;
    disconnectButton: string;
    disconnectFailedError: string;
    disconnectNetworkError: string;
  };
  dashboard: {
    tagline: string;
    passExpires: (formattedDate: string) => string;
    passStatusLabel: (status: "TRIAL" | "ACTIVE" | "EXPIRED") => string;
    privacyAndData: string;
    signOut: string;
    tabs: {
      navAriaLabel: string;
      clean: string;
      rules: string;
      history: string;
    };
    accountMenu: {
      buttonLabel: string;
      menuAriaLabel: string;
      preferencesLabel: string;
    };
    summary: {
      spaceReclaimed: string;
      emailsCleaned: (formattedCount: string) => string;
      scannedMessages: string;
      queryPrefix: (query: string) => string;
      queryAll: string;
      uniqueSenders: string;
      sortedBy: (sortLabel: string) => string;
      totalSpaceUsed: string;
      estimatedAcrossSenders: string;
      currentSelection: string;
      senderCount: (count: number, formattedCount: string) => string;
      emailCountSummary: (
        count: number,
        formattedCount: string,
        sizeLabel: string,
      ) => string;
      compactScanned: (formattedCount: string) => string;
      compactSendersSize: (
        senderCount: number,
        formattedSenders: string,
        sizeLabel: string,
      ) => string;
      compactReclaimed: (sizeLabel: string) => string;
    };
    filters: {
      presets: {
        all: string;
        promotions: string;
        social: string;
        updates: string;
        spam: string;
      };
      withAttachments: string;
      heavyAttachments: string;
      unreadOnly: string;
      searchLabel: string;
      searchPlaceholder: string;
      ageLabel: string;
      ageOptions: {
        any: string;
        "3m": string;
        "6m": string;
        "1y": string;
        "2y": string;
      };
      sizeLabel: string;
      sizeOptions: {
        any: string;
        "1M": string;
        "5M": string;
        "10M": string;
      };
      scanInbox: string;
      filtersButton: string;
      filtersPopoverAriaLabel: string;
      resetButton: string;
    };
    banners: {
      actionFailed: string;
      keepSafeRemovedTitle: string;
      keepSafeRemovedMessage: (label: string, scopeLabel: string) => string;
      keepSafeEnabledTitle: string;
      keepSafeEnabledMessage: (label: string, scopeLabel: string) => string;
      keepSafeErrorFallback: string;
      autoCleanSavedTitle: string;
      autoCleanSavedMessage: (label: string) => string;
      blockedInGmailTitle: string;
      blockedInGmailMessage: (target: string) => string;
      gmailSettingsScopeRequiredSave: string;
      autoCleanSaveErrorFallback: string;
      ruleRemovedTitle: string;
      autoCleanRemovedMessage: (label: string) => string;
      blockFilterRemovedMessage: (label: string) => string;
      gmailSettingsScopeRequiredRemove: string;
      autoCleanRemoveErrorFallback: string;
      autoCleanCompletedTitle: string;
      autoCleanCompletedMovedMessage: (
        count: number,
        label: string,
        protectedNote: string,
      ) => string;
      autoCleanCompletedNoneMessage: (
        label: string,
        protectedNote: string,
      ) => string;
      autoCleanRunErrorFallback: string;
      keptProtectedNote: (count: number) => string;
      protectedKeptSafeTitle: string;
      protectedKeptSafeNoActionMessage: (
        count: number,
        action: "trash" | "delete" | "archive" | "mark_read",
      ) => string;
      cleanupCompletedTitle: string;
      cleanupTrashSummary: (
        processedCount: number,
        senderCount: number,
      ) => string;
      cleanupArchiveSummary: (
        processedCount: number,
        senderCount: number,
      ) => string;
      cleanupMarkReadSummary: (
        processedCount: number,
        senderCount: number,
      ) => string;
      cleanupDeleteSummary: (
        processedCount: number,
        senderCount: number,
      ) => string;
      emptyTrashCompletedTitle: string;
      emptyTrashCompletedSummary: (deletedCount: number) => string;
      emptyTrashErrorFallback: string;
      undoButton: string;
      undoingButton: string;
      undoCompletedTitle: string;
      undoCompletedSummary: (
        messageCount: number,
        senderCount: number,
      ) => string;
      dismissAriaLabel: string;
      cleanupErrorFallback: string;
      unsubscribedTitle: string;
      unsubscribedOneClickMessage: (senderEmail: string) => string;
      unsubscribedMailtoMessage: (
        target: string,
        senderEmail: string,
      ) => string;
      unsubscribeActionRequiredTitle: string;
      unsubscribeActionRequiredMessage: (senderEmail: string) => string;
      unsubscribeNotFoundTitle: string;
      unsubscribeNotFoundMessage: (senderEmail: string) => string;
      unsubscribeErrorFallback: (senderEmail: string) => string;
      bulkUnsubscribeCompleteTitle: string;
      bulkUnsubscribeStoppedTitle: string;
      bulkUnsubscribeSummaryMessage: (summary: {
        unsubscribed: number;
        manualRequired: number;
        notFound: number;
        failed: number;
      }) => string;
      scanRateLimitFallback: string;
      scanErrorFallback: string;
    };
    keepSafeStrip: {
      ariaLabel: string;
      titleWithCount: (count: number) => string;
      description: string;
      removeAriaLabel: (pattern: string) => string;
      scopeLabel: (scope: "BRAND" | "DOMAIN" | "SENDER") => string;
      compactLink: (count: number) => string;
      emptyState: string;
    };
    autoClean: {
      ariaLabel: string;
      title: string;
      description: string;
      saveCurrentFilter: string;
      quickPresetsLabel: string;
      presetLabels: {
        "promotions-90d": string;
        "spam-30d": string;
        "social-90d": string;
      };
      currentFilterRuleLabel: (parts: string[]) => string;
      currentFilterWithAttachments: string;
      currentFilterUnreadOnly: string;
      emptyState: string;
      ruleTypeLabel: (
        type: "BLOCK_SENDER" | "BLOCK_DOMAIN" | "CLEAN_QUERY",
      ) => string;
      lastRunAtTitle: (formattedDateTime: string) => string;
      notExecutedYet: string;
      lastRunCount: (count: number) => string;
      gmailFilterActive: string;
      blockRuleSaved: string;
      runNow: string;
      remove: string;
      toggleAutoClean: (isExpanded: boolean, count: number) => string;
      builderTitle: string;
      builderCategoryLabel: string;
      builderAgeLabel: string;
      builderActionLabel: string;
      builderScheduleLabel: string;
      builderConditionsLabel: string;
      builderPreviewImpact: string;
      builderPreviewLoading: string;
      builderSaveRule: string;
      builderEmptyHint: string;
      actions: {
        trash: string;
        archive: string;
        mark_read: string;
      };
      schedules: {
        manual: string;
        daily: string;
        weekly: string;
      };
      statuses: {
        idle: string;
        ok: string;
        success: string;
        error: string;
        auth_error: string;
        rate_limited: string;
      };
      ruleEnabled: string;
      rulePaused: string;
      pauseRule: string;
      resumeRule: string;
      nextRunLabel: (formattedDateTime: string) => string;
      manualScheduleHint: string;
      previewSummary: (
        estimated: number,
        cleanable: number,
        protectedCount: number,
      ) => string;
      previewSampleSendersTitle: string;
      previewNoMatches: string;
      previewProtectedBadge: string;
      previewSenderCount: (count: number) => string;
    };
    results: {
      selectAllAriaLabel: string;
      selectAllLabel: (cleanableCount: number, protectedCount: number) => string;
      viewGroupAriaLabel: string;
      brandTree: string;
      flatSenders: string;
      cardsView: string;
      sortByLabel: string;
      sortOptions: {
        size: string;
        count: string;
        domains: string;
      };
      expandAll: string;
      collapseAll: string;
      movingToTrashStatus: string;
      archivingStatus: string;
      markingAsReadStatus: string;
      emptyingTrashStatus: string;
      deletingPermanentlyStatus: string;
      moveToTrashWithCount: (count: number) => string;
      archiveWithCount: (count: number) => string;
      markAsReadWithCount: (count: number) => string;
      deletePermanentlyWithCount: (count: number) => string;
      emptyTrash: string;
      clearSelection: string;
      unsubscribableOnly: string;
      unsubscribeSelectedWithCount: (count: number) => string;
      unsubscribeSelectedNoneTitle: string;
      bulkUnsubscribeProgress: (
        current: number,
        total: number,
        senderEmail: string,
      ) => string;
      stopBulkUnsubscribe: string;
      selectionDockAriaLabel: string;
      selectionDockSummary: (
        senderCount: number,
        formattedSenders: string,
        messageCount: number,
        formattedMessages: string,
        sizeLabel: string,
      ) => string;
      scanProgressWithEstimate: (
        loaded: string,
        total: string,
        percent: number,
      ) => string;
      scanProgressGeneric: string;
      scanProgressAriaLabel: string;
      stopScan: string;
      scanProgressHint: string;
      scanningTitle: string;
      scanningSubtitle: string;
      emptyTitle: string;
      emptySubtitle: string;
      resetFilters: string;
      loadedMoreSummary: (
        loaded: string,
        total: string | null,
        loadedNum: number,
      ) => string;
      loadMore: string;
      searchPlaceholder: string;
      clearSearchAriaLabel: string;
      showMoreItems: (count: number) => string;
      smallSendersSummary: (count: number) => string;
      showSmallSenders: string;
      hideSmallSenders: string;
    };
    tree: {
      expandLabel: (name: string) => string;
      collapseLabel: (name: string) => string;
      selectCleanableInLabel: (name: string) => string;
      selectSenderAriaLabel: (email: string) => string;
      domainCount: (count: number, formatted: string) => string;
      senderCount: (count: number, formatted: string) => string;
      protectedCount: (count: number) => string;
      emailCount: (count: number, formatted: string) => string;
      latestDate: (formattedDate: string) => string;
      unknownDate: string;
      keepSafeLabel: string;
      protectedLabel: string;
      protectedByRuleTitle: (
        scope: "BRAND" | "DOMAIN" | "SENDER",
        pattern: string,
      ) => string;
      blockedInGmailLabel: string;
      blockedInGmailDirectTitle: (pattern: string) => string;
      blockedInGmailDomainTitle: (pattern: string) => string;
      blockAutoTrashLabel: string;
      blockProtectedTooltip: string;
      blockAlreadyTooltip: string;
      blockActionTooltip: string;
      unsubscribedOneClick: string;
      unsubscribedEmailSent: string;
      unsubscribeAvailable: string;
      noUnsubscribeFound: string;
      noSubject: string;
      completeUnsubscribe: string;
      unsubscribing: string;
      unsubscribe: string;
      viewEmails: string;
      moveToTrash: string;
      archive: string;
      markAsRead: string;
      deletePermanently: string;
      moreActionsLabel: string;
      viewSubdomains: (count: number) => string;
      moreSubdomainsCount: (count: number) => string;
      brandSubdomainsTitle: (brandLabel: string) => string;
    };
    onboarding: {
      ariaLabel: string;
      title: string;
      dismissAriaLabel: string;
      step1Title: string;
      step1Desc: string;
      step2Title: string;
      step2Desc: string;
      step3Title: string;
      step3Desc: string;
    };
    previewModal: {
      closeAriaLabel: string;
      showingUpTo: (max: number, totalFormatted: string) => string;
      loadingList: string;
      emptyList: string;
      loadingEmails: string;
      selectEmailPrompt: string;
      loadingContent: string;
      fromLabel: string;
      unknownSender: string;
      toLabel: string;
      dateLabel: string;
      bodyFormatAriaLabel: string;
      formatted: string;
      plainText: string;
      iframeTitle: string;
      noReadableContent: string;
      sendersInScope: (count: number, formatted: string) => string;
      protectedKeptSafe: (count: number) => string;
      close: string;
      brandSubtitle: (domainCount: number, senderCount: number) => string;
      domainSubtitle: (senderCount: number) => string;
    };
    permanentDeleteModal: {
      title: string;
      descriptionBeforeCount: string;
      messageCountPhrase: (count: number, formatted: string) => string;
      descriptionBetweenSizeAndSenders: string;
      senderCountPhrase: (count: number) => string;
      descriptionAfterSenders: string;
      keepingProtectedBefore: string;
      keepingProtectedAfter: (count: number) => string;
      confirmCheckboxLabel: string;
      cancel: string;
      deletePermanently: string;
    };
    emptyTrashModal: {
      title: string;
      description: string;
      cancel: string;
      confirm: string;
    };
    cleanHistory: {
      title: string;
      subtitle: string;
      toggleLabel: (expanded: boolean, count: number) => string;
      emptyState: string;
      loading: string;
      columns: {
        date: string;
        action: string;
        messages: string;
        spaceFreed: string;
      };
      actions: {
        trash: string;
        delete: string;
        untrash: string;
        archive: string;
        mark_read: string;
        empty_trash: string;
      };
      messageCountLabel: (count: number, formatted: string) => string;
    };
    errors: {
      failedLoadMessageDetail: (status: number) => string;
      failedLoadMessageDetailFallback: string;
      failedLoadPreviews: (status: number) => string;
      failedLoadPreviewsFallback: string;
      failedScanInbox: (status: number) => string;
      failedUpdateKeepSafe: (status: number) => string;
      failedCreateAutoClean: (status: number) => string;
      failedUpdateAutoClean: (status: number) => string;
      failedPreviewAutoClean: (status: number) => string;
      failedRemoveAutoClean: (status: number) => string;
      failedRunAutoClean: (status: number) => string;
      failedCleanMessages: (status: number) => string;
      failedEmptyTrash: (status: number) => string;
      failedUnsubscribe: (email: string, status: number) => string;
      failedLoadHistory: (status: number) => string;
    };
  };
}

const TRANSLATIONS: Record<AppLanguage, AppTranslations> = {
  en: {
    controls: {
      themeGroupLabel: "Color theme",
      switchToLight: "Switch to light mode",
      switchToDark: "Switch to dark mode",
      darkLabel: "Dark",
      lightLabel: "Light",
      languageGroupLabel: "Language selector",
      switchToEnglish: "Switch language to English",
      switchToSpanish: "Switch language to Spanish",
    },
    privacyStrip: {
      ariaLabel: "Privacy and data protection commitments",
      title: "Privacy-First & Google API Limited Use",
      manageDataButton: "Manage data & disconnect",
      introBeforePolicy: "mailCleaner complies with the ",
      introPolicyName: "Google API Services User Data Policy",
      introAfterPolicy:
        " (Limited Use requirements). Your inbox stays under your control:",
      bullets: {
        neverSold: {
          label: "Never sold or shared:",
          text: "We never sell, rent, or transfer your data to advertisers or brokers.",
        },
        noAi: {
          label: "No AI training:",
          text: "Your emails are never used to train AI or machine-learning models.",
        },
        localMetadata: {
          label: "Local metadata only:",
          text: "Only sender, subject, date, and size are cached in your local database—never full email bodies.",
        },
        revocable: {
          label: "Revocable anytime:",
          text: "Delete your local cache and revoke Google OAuth access in one click.",
        },
      },
    },
    privacyModal: {
      title: "Privacy & Data Controls",
      connectedSubtitle: (email) => `Connected Gmail account: ${email}`,
      defaultSubtitle:
        "Review what mailCleaner stores locally and manage your Google connection.",
      closeAriaLabel: "Close privacy settings",
      storedSectionTitle: "What is stored locally in your database",
      storedItems: {
        metadata: {
          label: "Cached email metadata:",
          text: "Sender header, subject, date, byte size, and unsubscribe header availability so large inboxes stay responsive. Raw email bodies and attachments are never stored in the local database.",
        },
        keepSafe: {
          label: "Keep Safe rules:",
          text: "Your whitelisted senders, domains, and brands protected from accidental deletion.",
        },
        autoClean: {
          label: "Auto-Clean rules:",
          text: "Your configured cleanup rules, run counts, and Gmail filter IDs.",
        },
        oauth: {
          label: "OAuth & session state:",
          text: "Your Google OAuth tokens, active session, and reclaimed storage counters.",
        },
      },
      oauthSectionTitle:
        "OAuth permissions & Google Limited Use compliance",
      oauthParagraph1:
        "mailCleaner uses Google OAuth 2.0 solely to group your inbox senders, render on-demand previews, unsubscribe on your behalf, sync Auto-Clean Gmail filters, and move to Trash or delete messages you explicitly select.",
      oauthParagraph2BeforePolicy: "In accordance with the ",
      oauthPolicyName: "Google API Services User Data Policy",
      oauthParagraph2AfterPolicy:
        " (Limited Use), mailCleaner never sells your data, never uses Gmail data for advertising, and never trains AI models on your emails.",
      disconnectTitle: "Delete local data & disconnect Google account",
      disconnectDescription:
        "This revokes your Google OAuth token with Google (best-effort) and permanently erases all cached message metadata, Keep Safe rules, Auto-Clean rules, active sessions, and linked OAuth tokens from mailCleaner. Your actual emails inside Gmail are not touched.",
      confirmCheckboxLabel:
        "I understand this will permanently delete my local metadata cache, Keep Safe rules, Auto-Clean rules, and disconnect my Google account from mailCleaner.",
      cancelButton: "Cancel",
      disconnectingButton: "Deleting local cache & disconnecting...",
      disconnectButton: "Delete my local cache & disconnect",
      disconnectFailedError:
        "Failed to delete your local cache and disconnect. Please try again.",
      disconnectNetworkError:
        "Network error while disconnecting your account. Please try again.",
    },
    dashboard: {
      tagline: "Group senders and reclaim Gmail storage",
      passExpires: (formattedDate) => `Pass expires ${formattedDate}`,
      passStatusLabel: (status) => {
        if (status === "ACTIVE") return "ACTIVE";
        if (status === "EXPIRED") return "EXPIRED";
        return "TRIAL";
      },
      privacyAndData: "Privacy & Data",
      signOut: "Sign out",
      tabs: {
        navAriaLabel: "Dashboard sections",
        clean: "Clean",
        rules: "Auto-Clean & Protected",
        history: "History",
      },
      accountMenu: {
        buttonLabel: "Account",
        menuAriaLabel: "Account menu",
        preferencesLabel: "Preferences",
      },
      summary: {
        spaceReclaimed: "Space Reclaimed",
        emailsCleaned: (formattedCount) => `${formattedCount} emails cleaned`,
        scannedMessages: "Scanned Messages",
        queryPrefix: (query) => `Query: ${query}`,
        queryAll: "Query: All Inbox & Mail",
        uniqueSenders: "Unique Senders",
        sortedBy: (sortLabel) => `Sorted by ${sortLabel.toLowerCase()}`,
        totalSpaceUsed: "Total Space Used",
        estimatedAcrossSenders: "Estimated across scanned senders",
        currentSelection: "Current Selection",
        senderCount: (count, formattedCount) =>
          `${formattedCount} sender${count === 1 ? "" : "s"}`,
        emailCountSummary: (count, formattedCount, sizeLabel) =>
          `${formattedCount} email${count === 1 ? "" : "s"} (${sizeLabel})`,
        compactScanned: (formattedCount) => `Scanned: ${formattedCount}`,
        compactSendersSize: (senderCount, formattedSenders, sizeLabel) =>
          `${formattedSenders} sender${senderCount === 1 ? "" : "s"} · ${sizeLabel}`,
        compactReclaimed: (sizeLabel) => `Reclaimed: ${sizeLabel}`,
      },
      filters: {
        presets: {
          all: "All Mail",
          promotions: "Promotions",
          social: "Social",
          updates: "Updates",
          spam: "Spam",
        },
        withAttachments: "With Attachments",
        heavyAttachments: "Heavy Attachments (> 5 MB)",
        unreadOnly: "Unread only",
        searchLabel: "Search query",
        searchPlaceholder: "Sender, domain, or keyword...",
        ageLabel: "Age",
        ageOptions: {
          any: "Any age",
          "3m": "Older than 3 months",
          "6m": "Older than 6 months",
          "1y": "Older than 1 year",
          "2y": "Older than 2 years",
        },
        sizeLabel: "Message size",
        sizeOptions: {
          any: "Any size",
          "1M": "Larger than 1 MB",
          "5M": "Larger than 5 MB",
          "10M": "Larger than 10 MB",
        },
        scanInbox: "Scan Inbox",
        filtersButton: "Filters",
        filtersPopoverAriaLabel: "Scan filters",
        resetButton: "Reset",
      },
      banners: {
        actionFailed: "Action failed",
        keepSafeRemovedTitle: "Keep safe removed",
        keepSafeRemovedMessage: (label, scopeLabel) =>
          `Removed ${label} (${scopeLabel}) from Keep safe protection.`,
        keepSafeEnabledTitle: "Keep safe enabled",
        keepSafeEnabledMessage: (label, scopeLabel) =>
          `${label} (${scopeLabel}) is now protected from cleanup actions.`,
        keepSafeErrorFallback: "Failed to update Keep safe protection rule.",
        autoCleanSavedTitle: "Auto-Clean rule saved",
        autoCleanSavedMessage: (label) =>
          `Saved Auto-Clean rule "${label}". Click Run now anytime to move matching messages to Trash.`,
        blockedInGmailTitle: "Blocked in Gmail",
        blockedInGmailMessage: (target) =>
          `Created Gmail filter for ${target}. Future emails will be sent directly to Trash.`,
        gmailSettingsScopeRequiredSave:
          "Gmail settings permission is required. Please sign out and sign in again to grant Gmail filter permissions.",
        autoCleanSaveErrorFallback: "Failed to save Auto-Clean rule.",
        ruleRemovedTitle: "Rule removed",
        autoCleanRemovedMessage: (label) =>
          `Removed Auto-Clean rule "${label}".`,
        blockFilterRemovedMessage: (label) =>
          `Removed Gmail block filter for "${label}".`,
        gmailSettingsScopeRequiredRemove:
          "Gmail settings permission is required. Please sign out and sign in again to remove native Gmail filters.",
        autoCleanRemoveErrorFallback: "Failed to remove Auto-Clean rule.",
        autoCleanCompletedTitle: "Auto-Clean completed",
        autoCleanCompletedMovedMessage: (count, label, protectedNote) =>
          `Moved ${count} matching email(s) to Trash for "${label}".${protectedNote}`,
        autoCleanCompletedNoneMessage: (label, protectedNote) =>
          `No cleanable matching emails found for "${label}".${protectedNote}`,
        autoCleanRunErrorFallback: "Failed to execute Auto-Clean rule.",
        keptProtectedNote: (count) =>
          ` Kept ${count} protected message(s) safe.`,
        protectedKeptSafeTitle: "Protected emails kept safe",
        protectedKeptSafeNoActionMessage: (count, action) =>
          `Kept ${count} protected message(s) safe. No messages were ${
            action === "trash"
              ? "moved to Trash"
              : action === "archive"
                ? "archived"
                : action === "mark_read"
                  ? "marked as read"
                  : "deleted"
          }.`,
        cleanupCompletedTitle: "Cleanup completed",
        cleanupTrashSummary: (processedCount, senderCount) =>
          `Moved ${processedCount} message(s) from ${senderCount} sender(s) to Trash.`,
        cleanupArchiveSummary: (processedCount, senderCount) =>
          `Archived ${processedCount} message(s) from ${senderCount} sender(s).`,
        cleanupMarkReadSummary: (processedCount, senderCount) =>
          `Marked ${processedCount} message(s) from ${senderCount} sender(s) as read.`,
        cleanupDeleteSummary: (processedCount, senderCount) =>
          `Permanently deleted ${processedCount} message(s) from ${senderCount} sender(s).`,
        emptyTrashCompletedTitle: "Trash emptied",
        emptyTrashCompletedSummary: (deletedCount) =>
          deletedCount === 0
            ? "Your Gmail Trash is already empty."
            : `Permanently deleted ${deletedCount} message(s) from Trash.`,
        emptyTrashErrorFallback: "Failed to empty Gmail Trash.",
        cleanupErrorFallback: "Failed to clean selected Gmail messages.",
        undoButton: "Undo",
        undoingButton: "Undoing...",
        undoCompletedTitle: "Moved back to Inbox",
        undoCompletedSummary: (messageCount, senderCount) =>
          `Restored ${messageCount} message${messageCount === 1 ? "" : "s"} from ${senderCount} sender${senderCount === 1 ? "" : "s"} back to Inbox.`,
        dismissAriaLabel: "Dismiss notice",
        unsubscribedTitle: "Unsubscribed",
        unsubscribedOneClickMessage: (senderEmail) =>
          `Successfully unsubscribed from ${senderEmail} via One-Click HTTP.`,
        unsubscribedMailtoMessage: (target, senderEmail) =>
          `Sent unsubscribe email to ${target} for ${senderEmail}.`,
        unsubscribeActionRequiredTitle: "Manual confirmation required",
        unsubscribeActionRequiredMessage: (senderEmail) =>
          `Found an unsubscribe link for ${senderEmail}. Click "Complete unsubscribe" in that row to finish.`,
        unsubscribeNotFoundTitle: "No unsubscribe option found",
        unsubscribeNotFoundMessage: (senderEmail) =>
          `No List-Unsubscribe header or unsubscribe link was found in recent messages from ${senderEmail}.`,
        unsubscribeErrorFallback: (senderEmail) =>
          `Failed to unsubscribe from ${senderEmail}.`,
        bulkUnsubscribeCompleteTitle: "Bulk unsubscribe finished",
        bulkUnsubscribeStoppedTitle: "Bulk unsubscribe stopped",
        bulkUnsubscribeSummaryMessage: (summary) =>
          `Unsubscribed: ${summary.unsubscribed}, manual confirmation required: ${summary.manualRequired}, failed: ${summary.failed}${
            summary.notFound > 0 ? `, no option found: ${summary.notFound}` : ""
          }.`,
        scanRateLimitFallback: "Gmail rate limit reached.",
        scanErrorFallback: "Failed to scan your Gmail inbox.",
      },
      keepSafeStrip: {
        ariaLabel: "Active Keep safe protection rules",
        titleWithCount: (count) => `Keep safe (${count})`,
        description:
          "Protected senders and domains are excluded from bulk selection and cleanup:",
        removeAriaLabel: (pattern) => `Remove ${pattern} from Keep safe`,
        scopeLabel: (scope) => scope.toLowerCase(),
        compactLink: (count) => `${count} protected · Manage`,
        emptyState:
          "No protected senders, domains, or brands yet. Use Keep safe on any sender in Clean to exclude it from bulk actions.",
      },
      autoClean: {
        ariaLabel: "Auto-Clean & Block Rules",
        title: "Auto-Clean & Block Rules",
        description:
          "Block future emails with native Gmail auto-trash filters or save recurring cleanup queries to run on demand.",
        saveCurrentFilter: "Save current filter as Auto-Clean rule",
        quickPresetsLabel: "Quick presets:",
        presetLabels: {
          "promotions-90d": "Trash Promotions > 90d",
          "spam-30d": "Trash Spam > 30d",
          "social-90d": "Trash Social > 90d",
        },
        currentFilterRuleLabel: (parts) =>
          `Trash ${parts.join(" • ")}`.slice(0, 200),
        currentFilterWithAttachments: "with attachments",
        currentFilterUnreadOnly: "unread only",
        emptyState:
          "No Auto-Clean or Gmail block rules configured yet. Add a quick preset above, save an active search filter, or click Block & Auto-Trash on any domain or sender below.",
        ruleTypeLabel: (type) => type,
        lastRunAtTitle: (formattedDateTime) =>
          `Last run at ${formattedDateTime}`,
        notExecutedYet: "Not executed yet",
        lastRunCount: (count) =>
          `Last run: ${count} email${count === 1 ? "" : "s"}`,
        gmailFilterActive: "Gmail filter active",
        blockRuleSaved: "Block rule saved",
        runNow: "Run now",
        remove: "Remove",
        toggleAutoClean: (isExpanded, count) => {
          if (isExpanded) return "Hide rules";
          return count > 0 ? `Manage rules (${count})` : "Configure rules";
        },
        builderTitle: "Visual rule builder",
        builderCategoryLabel: "Category",
        builderAgeLabel: "Older than",
        builderActionLabel: "Action",
        builderScheduleLabel: "Frequency",
        builderConditionsLabel: "Conditions",
        builderPreviewImpact: "Preview impact",
        builderPreviewLoading: "Previewing...",
        builderSaveRule: "Save rule",
        builderEmptyHint:
          "Select at least one category, age, unread, or attachment condition.",
        actions: {
          trash: "Trash",
          archive: "Archive",
          mark_read: "Mark as read",
        },
        schedules: {
          manual: "Manual",
          daily: "Daily",
          weekly: "Weekly",
        },
        statuses: {
          idle: "Idle",
          ok: "OK",
          success: "Success",
          error: "Error",
          auth_error: "Auth error",
          rate_limited: "Rate limited",
        },
        ruleEnabled: "Active",
        rulePaused: "Paused",
        pauseRule: "Pause",
        resumeRule: "Resume",
        nextRunLabel: (formattedDateTime) => `Next run: ${formattedDateTime}`,
        manualScheduleHint: "Manual only",
        previewSummary: (estimated, cleanable, protectedCount) =>
          `~${estimated} estimated · ${cleanable} cleanable in sample · ${protectedCount} protected by Keep safe`,
        previewSampleSendersTitle: "Top matching senders",
        previewNoMatches: "No matching emails found for this rule.",
        previewProtectedBadge: "Keep safe",
        previewSenderCount: (count) =>
          `${count} email${count === 1 ? "" : "s"}`,
      },
      results: {
        selectAllAriaLabel: "Select all cleanable senders",
        selectAllLabel: (cleanableCount, protectedCount) =>
          `Select all (${cleanableCount} sender${
            cleanableCount === 1 ? "" : "s"
          }${protectedCount > 0 ? `, ${protectedCount} protected` : ""})`,
        viewGroupAriaLabel: "Results view",
        brandTree: "Brand Tree",
        flatSenders: "Flat Senders",
        cardsView: "Cards",
        sortByLabel: "Sort by",
        sortOptions: {
          size: "Storage used",
          count: "Email count",
          domains: "Subdomain count",
        },
        expandAll: "Expand all",
        collapseAll: "Collapse all",
        movingToTrashStatus: "Moving messages to Trash...",
        archivingStatus: "Archiving messages...",
        markingAsReadStatus: "Marking messages as read...",
        emptyingTrashStatus: "Emptying Trash...",
        deletingPermanentlyStatus: "Permanently deleting messages...",
        moveToTrashWithCount: (count) => `Move to Trash (${count})`,
        archiveWithCount: (count) => `Archive (${count})`,
        markAsReadWithCount: (count) => `Mark as read (${count})`,
        deletePermanentlyWithCount: (count) => `Delete permanently (${count})`,
        emptyTrash: "Empty Trash",
        clearSelection: "Clear selection",
        unsubscribableOnly: "Unsubscribable only",
        unsubscribeSelectedWithCount: (count) =>
          `Unsubscribe selected (${count})`,
        unsubscribeSelectedNoneTitle:
          "No selected senders have an unsubscribe option",
        bulkUnsubscribeProgress: (current, total, senderEmail) =>
          `Unsubscribing ${current}/${total}: ${senderEmail}...`,
        stopBulkUnsubscribe: "Stop",
        selectionDockAriaLabel: "Actions for selected senders",
        selectionDockSummary: (
          senderCount,
          formattedSenders,
          messageCount,
          formattedMessages,
          sizeLabel,
        ) =>
          `${formattedSenders} sender${senderCount === 1 ? "" : "s"} · ${formattedMessages} email${messageCount === 1 ? "" : "s"} (${sizeLabel})`,
        scanProgressWithEstimate: (loaded, total, percent) =>
          `Still loading your emails — loaded ${loaded} of ~${total} emails (${percent}%)`,
        scanProgressGeneric: "Still loading your emails...",
        scanProgressAriaLabel: "Email scan progress",
        stopScan: "Stop scan",
        scanProgressHint:
          "Scanning may take a few minutes depending on message volume. Senders appear as they load, and you can stop anytime.",
        scanningTitle: "Scanning your Gmail inbox...",
        scanningSubtitle:
          "Fetching message metadata and grouping senders by storage usage.",
        emptyTitle: "No matching senders found",
        emptySubtitle:
          "Try adjusting your quick filters or search query, then click Scan Inbox.",
        resetFilters: "Reset filters",
        loadedMoreSummary: (loaded, total, loadedNum) =>
          `Loaded ${loaded} email${loadedNum === 1 ? "" : "s"}${
            total ? ` of ~${total}` : ""
          }. More matching emails are available.`,
        loadMore: "Load more",
        searchPlaceholder: "Search senders, brands, or domains...",
        clearSearchAriaLabel: "Clear search",
        showMoreItems: (count) => `Show ${count} more`,
        smallSendersSummary: (count) =>
          `${count} small sender${count === 1 ? "" : "s"} (≤ 2 emails, < 500 KB)`,
        showSmallSenders: "Show",
        hideSmallSenders: "Hide",
      },
      tree: {
        expandLabel: (name) => `Expand ${name}`,
        collapseLabel: (name) => `Collapse ${name}`,
        selectCleanableInLabel: (name) =>
          `Select cleanable senders in ${name}`,
        selectSenderAriaLabel: (email) => `Select ${email}`,
        domainCount: (count, formatted) =>
          `${formatted} domain${count === 1 ? "" : "s"}`,
        senderCount: (count, formatted) =>
          `${formatted} sender${count === 1 ? "" : "s"}`,
        protectedCount: (count) => `${count} protected`,
        emailCount: (count, formatted) =>
          `${formatted} email${count === 1 ? "" : "s"}`,
        latestDate: (formattedDate) => `Latest: ${formattedDate}`,
        unknownDate: "Unknown date",
        keepSafeLabel: "Keep safe",
        protectedLabel: "Protected",
        protectedByRuleTitle: (scope, pattern) =>
          `Protected by ${scope.toLowerCase()} rule: ${pattern}`,
        blockedInGmailLabel: "Blocked in Gmail",
        blockedInGmailDirectTitle: (pattern) =>
          `Blocked in Gmail: ${pattern}`,
        blockedInGmailDomainTitle: (pattern) =>
          `Blocked in Gmail via domain rule: ${pattern}`,
        blockAutoTrashLabel: "Block & Auto-Trash",
        blockProtectedTooltip:
          "Protected by Keep safe. Remove protection before blocking.",
        blockAlreadyTooltip: "Already blocked in Gmail",
        blockActionTooltip:
          "Create a native Gmail filter to auto-trash future emails",
        unsubscribedOneClick: "Unsubscribed (One-Click)",
        unsubscribedEmailSent: "Unsubscribed (Email sent)",
        unsubscribeAvailable: "Unsubscribe available",
        noUnsubscribeFound: "No unsubscribe link found",
        noSubject: "(No subject)",
        completeUnsubscribe: "Complete unsubscribe",
        unsubscribing: "Unsubscribing...",
        unsubscribe: "Unsubscribe",
        viewEmails: "View emails",
        moveToTrash: "Move to Trash",
        archive: "Archive",
        markAsRead: "Mark as read",
        deletePermanently: "Delete permanently",
        moreActionsLabel: "More actions",
        viewSubdomains: (count) => `Subdomains (${count})`,
        moreSubdomainsCount: (count) => `+${count} more`,
        brandSubdomainsTitle: (brandLabel) => `${brandLabel} subdomains`,
      },
      onboarding: {
        ariaLabel: "Quick start guide",
        title: "Quick start",
        dismissAriaLabel: "Dismiss quick start guide",
        step1Title: "1. Keep safe",
        step1Desc: "Mark important senders or domains so they are never touched.",
        step2Title: "2. Preview",
        step2Desc: "Inspect sample emails before cleaning a sender.",
        step3Title: "3. Clean with Undo",
        step3Desc: "Move to Trash safely and undo immediately if needed.",
      },
      previewModal: {
        closeAriaLabel: "Close email preview",
        showingUpTo: (max, totalFormatted) =>
          `Showing up to ${max} emails from ${totalFormatted} scanned`,
        loadingList: "Loading email list...",
        emptyList: "No previewable emails found for this group.",
        loadingEmails: "Loading emails...",
        selectEmailPrompt: "Select an email from the list to preview its content.",
        loadingContent: "Loading email content...",
        fromLabel: "From:",
        unknownSender: "Unknown",
        toLabel: "To:",
        dateLabel: "Date:",
        bodyFormatAriaLabel: "Email body format",
        formatted: "Formatted",
        plainText: "Plain text",
        iframeTitle: "Email preview",
        noReadableContent: "(No readable message content)",
        sendersInScope: (count, formatted) =>
          `${formatted} sender${count === 1 ? "" : "s"} in scope`,
        protectedKeptSafe: (count) => `${count} protected kept safe`,
        close: "Close",
        brandSubtitle: (domainCount, senderCount) =>
          `${domainCount} domain${domainCount === 1 ? "" : "s"} • ${senderCount} sender${senderCount === 1 ? "" : "s"}`,
        domainSubtitle: (senderCount) =>
          `${senderCount} sender${senderCount === 1 ? "" : "s"}`,
      },
      permanentDeleteModal: {
        title: "Confirm permanent deletion",
        descriptionBeforeCount: "This action permanently removes ",
        messageCountPhrase: (count, formatted) =>
          `${formatted} message${count === 1 ? "" : "s"}`,
        descriptionBetweenSizeAndSenders: " from ",
        senderCountPhrase: (count) =>
          `${count} sender${count === 1 ? "" : "s"}`,
        descriptionAfterSenders:
          ". Deleted messages bypass Trash and cannot be recovered.",
        keepingProtectedBefore: "Keeping ",
        keepingProtectedAfter: (count) =>
          ` protected message${count === 1 ? "" : "s"} safe.`,
        confirmCheckboxLabel:
          "I understand this will permanently delete these messages from Gmail immediately and cannot be undone.",
        cancel: "Cancel",
        deletePermanently: "Delete permanently",
      },
      emptyTrashModal: {
        title: "Empty Gmail Trash?",
        description:
          "This will permanently delete all messages currently in your Gmail Trash. Deleted messages cannot be recovered.",
        cancel: "Cancel",
        confirm: "Empty Trash",
      },
      errors: {
        failedLoadMessageDetail: (status) =>
          `Failed to load message details (HTTP ${status}).`,
        failedLoadMessageDetailFallback: "Failed to load message details.",
        failedLoadPreviews: (status) =>
          `Failed to load email previews (HTTP ${status}).`,
        failedLoadPreviewsFallback: "Failed to load email previews.",
        failedScanInbox: (status) =>
          `Failed to scan inbox (HTTP ${status}).`,
        failedUpdateKeepSafe: (status) =>
          `Failed to update Keep safe rule (HTTP ${status}).`,
        failedCreateAutoClean: (status) =>
          `Failed to create Auto-Clean rule (HTTP ${status}).`,
        failedUpdateAutoClean: (status) =>
          `Failed to update Auto-Clean rule (HTTP ${status}).`,
        failedPreviewAutoClean: (status) =>
          `Failed to preview Auto-Clean rule (HTTP ${status}).`,
        failedRemoveAutoClean: (status) =>
          `Failed to remove Auto-Clean rule (HTTP ${status}).`,
        failedRunAutoClean: (status) =>
          `Failed to run Auto-Clean rule (HTTP ${status}).`,
        failedCleanMessages: (status) =>
          `Failed to clean messages (HTTP ${status}).`,
        failedEmptyTrash: (status) =>
          `Failed to empty Trash (HTTP ${status}).`,
        failedUnsubscribe: (email, status) =>
          `Failed to unsubscribe from ${email} (HTTP ${status}).`,
        failedLoadHistory: (status) =>
          `Failed to load clean history (HTTP ${status}).`,
      },
      cleanHistory: {
        title: "Clean Activity",
        subtitle:
          "Recent cleanup actions and storage reclaimed across your inbox.",
        toggleLabel: (expanded, count) =>
          expanded ? "Hide activity" : `Show activity (${count})`,
        emptyState: "No cleaning actions recorded yet.",
        loading: "Refreshing history...",
        columns: {
          date: "Date",
          action: "Action",
          messages: "Messages",
          spaceFreed: "Space freed",
        },
        actions: {
          trash: "Moved to Trash",
          delete: "Permanently deleted",
          untrash: "Restored from Trash",
          archive: "Archived",
          mark_read: "Marked as read",
          empty_trash: "Emptied Trash",
        },
        messageCountLabel: (count, formatted) =>
          `${formatted} message${count === 1 ? "" : "s"}`,
      },
    },
  },
  es: {
    controls: {
      themeGroupLabel: "Tema de color",
      switchToLight: "Cambiar a modo claro",
      switchToDark: "Cambiar a modo oscuro",
      darkLabel: "Oscuro",
      lightLabel: "Claro",
      languageGroupLabel: "Selector de idioma",
      switchToEnglish: "Cambiar idioma a inglés",
      switchToSpanish: "Cambiar idioma a español",
    },
    privacyStrip: {
      ariaLabel: "Compromisos de privacidad y protección de datos",
      title: "Privacidad primero · Google API Limited Use",
      manageDataButton: "Gestionar datos y desconectar",
      introBeforePolicy: "mailCleaner cumple con la ",
      introPolicyName: "Google API Services User Data Policy",
      introAfterPolicy:
        " (requisitos de Uso Limitado). Tu bandeja permanece bajo tu control:",
      bullets: {
        neverSold: {
          label: "Nunca se vende ni comparte:",
          text: "Jamás vendemos, alquilamos ni transferimos tus datos a anunciantes o intermediarios.",
        },
        noAi: {
          label: "Sin entrenamiento de IA:",
          text: "Tus correos nunca se usan para entrenar modelos de inteligencia artificial o machine learning.",
        },
        localMetadata: {
          label: "Solo metadatos locales:",
          text: "Únicamente remitente, asunto, fecha y tamaño se guardan en tu base local—nunca cuerpos completos.",
        },
        revocable: {
          label: "Revocable en cualquier momento:",
          text: "Elimina tu caché local y revoca el acceso de Google OAuth en un clic.",
        },
      },
    },
    privacyModal: {
      title: "Controles de Privacidad y Datos",
      connectedSubtitle: (email) => `Cuenta de Gmail conectada: ${email}`,
      defaultSubtitle:
        "Revisa qué guarda mailCleaner localmente y administra tu conexión con Google.",
      closeAriaLabel: "Cerrar configuración de privacidad",
      storedSectionTitle: "Qué se almacena localmente en tu base de datos",
      storedItems: {
        metadata: {
          label: "Metadatos de correos en caché:",
          text: "Cabecera de remitente, asunto, fecha, tamaño en bytes y disponibilidad de desuscripción para que buzones grandes respondan rápido. Los cuerpos y adjuntos nunca se guardan localmente.",
        },
        keepSafe: {
          label: "Reglas Keep Safe:",
          text: "Tus remitentes, dominios y marcas en lista blanca protegidos contra borrado accidental.",
        },
        autoClean: {
          label: "Reglas Auto-Clean:",
          text: "Tus reglas de limpieza configuradas, conteos de ejecución e IDs de filtros de Gmail.",
        },
        oauth: {
          label: "Estado de OAuth y sesión:",
          text: "Tus tokens de Google OAuth, sesión activa y contadores de espacio recuperado.",
        },
      },
      oauthSectionTitle:
        "Permisos OAuth y cumplimiento con Google Limited Use",
      oauthParagraph1:
        "mailCleaner usa Google OAuth 2.0 únicamente para agrupar los remitentes de tu bandeja, mostrar vistas previas bajo demanda, desuscribirte en tu nombre, sincronizar filtros Auto-Clean en Gmail y mover a Papelera o borrar los mensajes que selecciones explícitamente.",
      oauthParagraph2BeforePolicy: "De acuerdo con la ",
      oauthPolicyName: "Google API Services User Data Policy",
      oauthParagraph2AfterPolicy:
        " (Uso Limitado), mailCleaner nunca vende tus datos, nunca usa información de Gmail para publicidad y nunca entrena modelos de IA con tus correos.",
      disconnectTitle: "Borrar datos locales y desconectar cuenta de Google",
      disconnectDescription:
        "Esto revoca tu token de Google OAuth ante Google (mejor esfuerzo) y elimina de forma permanente todos los metadatos en caché, reglas Keep Safe, reglas Auto-Clean, sesiones activas y tokens OAuth vinculados en mailCleaner. Tus correos reales en Gmail no se modifican.",
      confirmCheckboxLabel:
        "Entiendo que esto eliminará permanentemente mi caché local de metadatos, reglas Keep Safe, reglas Auto-Clean y desconectará mi cuenta de Google de mailCleaner.",
      cancelButton: "Cancelar",
      disconnectingButton: "Borrando caché local y desconectando...",
      disconnectButton: "Borrar mi caché local y desconectar",
      disconnectFailedError:
        "No se pudo borrar tu caché local y desconectar. Inténtalo de nuevo.",
      disconnectNetworkError:
        "Error de red al desconectar tu cuenta. Inténtalo de nuevo.",
    },
    dashboard: {
      tagline: "Agrupa remitentes y recupera espacio en Gmail",
      passExpires: (formattedDate) => `El pase vence el ${formattedDate}`,
      passStatusLabel: (status) => {
        if (status === "ACTIVE") return "ACTIVO";
        if (status === "EXPIRED") return "EXPIRADO";
        return "PRUEBA";
      },
      privacyAndData: "Privacidad y Datos",
      signOut: "Cerrar sesión",
      tabs: {
        navAriaLabel: "Secciones del panel",
        clean: "Limpiar",
        rules: "Auto-Clean y Protegidos",
        history: "Historial",
      },
      accountMenu: {
        buttonLabel: "Cuenta",
        menuAriaLabel: "Menú de cuenta",
        preferencesLabel: "Preferencias",
      },
      summary: {
        spaceReclaimed: "Espacio recuperado",
        emailsCleaned: (formattedCount) => `${formattedCount} correos limpiados`,
        scannedMessages: "Mensajes escaneados",
        queryPrefix: (query) => `Consulta: ${query}`,
        queryAll: "Consulta: Toda la bandeja",
        uniqueSenders: "Remitentes únicos",
        sortedBy: (sortLabel) => `Ordenado por ${sortLabel.toLowerCase()}`,
        totalSpaceUsed: "Espacio total usado",
        estimatedAcrossSenders: "Estimado entre remitentes escaneados",
        currentSelection: "Selección actual",
        senderCount: (count, formattedCount) =>
          `${formattedCount} remitente${count === 1 ? "" : "s"}`,
        emailCountSummary: (count, formattedCount, sizeLabel) =>
          `${formattedCount} correo${count === 1 ? "" : "s"} (${sizeLabel})`,
        compactScanned: (formattedCount) => `Escaneados: ${formattedCount}`,
        compactSendersSize: (senderCount, formattedSenders, sizeLabel) =>
          `${formattedSenders} remitente${senderCount === 1 ? "" : "s"} · ${sizeLabel}`,
        compactReclaimed: (sizeLabel) => `Liberado: ${sizeLabel}`,
      },
      filters: {
        presets: {
          all: "Todo",
          promotions: "Promociones",
          social: "Social",
          updates: "Notificaciones",
          spam: "Spam",
        },
        withAttachments: "Con adjuntos",
        heavyAttachments: "Adjuntos pesados (> 5 MB)",
        unreadOnly: "Solo no leídos",
        searchLabel: "Búsqueda",
        searchPlaceholder: "Remitente, dominio o palabra clave...",
        ageLabel: "Antigüedad",
        ageOptions: {
          any: "Cualquier fecha",
          "3m": "Más de 3 meses",
          "6m": "Más de 6 meses",
          "1y": "Más de 1 año",
          "2y": "Más de 2 años",
        },
        sizeLabel: "Tamaño del mensaje",
        sizeOptions: {
          any: "Cualquier tamaño",
          "1M": "Mayor a 1 MB",
          "5M": "Mayor a 5 MB",
          "10M": "Mayor a 10 MB",
        },
        scanInbox: "Escanear bandeja",
        filtersButton: "Filtros",
        filtersPopoverAriaLabel: "Filtros de escaneo",
        resetButton: "Restablecer",
      },
      banners: {
        actionFailed: "Error en la acción",
        keepSafeRemovedTitle: "Protección Keep safe eliminada",
        keepSafeRemovedMessage: (label, scopeLabel) =>
          `Se quitó ${label} (${scopeLabel}) de la protección Keep safe.`,
        keepSafeEnabledTitle: "Keep safe activado",
        keepSafeEnabledMessage: (label, scopeLabel) =>
          `${label} (${scopeLabel}) ahora está protegido contra acciones de limpieza.`,
        keepSafeErrorFallback:
          "No se pudo actualizar la regla de protección Keep safe.",
        autoCleanSavedTitle: "Regla Auto-Clean guardada",
        autoCleanSavedMessage: (label) =>
          `Se guardó la regla Auto-Clean "${label}". Haz clic en Ejecutar ahora en cualquier momento para mover los mensajes coincidentes a la Papelera.`,
        blockedInGmailTitle: "Bloqueado en Gmail",
        blockedInGmailMessage: (target) =>
          `Se creó el filtro en Gmail para ${target}. Los correos futuros se enviarán directamente a la Papelera.`,
        gmailSettingsScopeRequiredSave:
          "Se requiere permiso de configuración de Gmail. Cierra sesión y vuelve a iniciarla para otorgar permisos de filtros en Gmail.",
        autoCleanSaveErrorFallback: "No se pudo guardar la regla Auto-Clean.",
        ruleRemovedTitle: "Regla eliminada",
        autoCleanRemovedMessage: (label) =>
          `Se eliminó la regla Auto-Clean "${label}".`,
        blockFilterRemovedMessage: (label) =>
          `Se eliminó el filtro de bloqueo en Gmail para "${label}".`,
        gmailSettingsScopeRequiredRemove:
          "Se requiere permiso de configuración de Gmail. Cierra sesión y vuelve a iniciarla para eliminar filtros nativos de Gmail.",
        autoCleanRemoveErrorFallback: "No se pudo eliminar la regla Auto-Clean.",
        autoCleanCompletedTitle: "Auto-Clean completado",
        autoCleanCompletedMovedMessage: (count, label, protectedNote) =>
          `Se movieron ${count} correo(s) coincidente(s) a la Papelera para "${label}".${protectedNote}`,
        autoCleanCompletedNoneMessage: (label, protectedNote) =>
          `No se encontraron correos limpiables para "${label}".${protectedNote}`,
        autoCleanRunErrorFallback: "No se pudo ejecutar la regla Auto-Clean.",
        keptProtectedNote: (count) =>
          ` Se mantuvieron a salvo ${count} mensaje(s) protegido(s).`,
        protectedKeptSafeTitle: "Correos protegidos a salvo",
        protectedKeptSafeNoActionMessage: (count, action) =>
          `Se mantuvieron a salvo ${count} mensaje(s) protegido(s). Ningún mensaje fue ${
            action === "trash"
              ? "movido a la Papelera"
              : action === "archive"
                ? "archivado"
                : action === "mark_read"
                  ? "marcado como leído"
                  : "eliminado"
          }.`,
        cleanupCompletedTitle: "Limpieza completada",
        cleanupTrashSummary: (processedCount, senderCount) =>
          `Se movieron ${processedCount} mensaje(s) de ${senderCount} remitente(s) a la Papelera.`,
        cleanupArchiveSummary: (processedCount, senderCount) =>
          `Se archivaron ${processedCount} mensaje(s) de ${senderCount} remitente(s).`,
        cleanupMarkReadSummary: (processedCount, senderCount) =>
          `Se marcaron ${processedCount} mensaje(s) de ${senderCount} remitente(s) como leídos.`,
        cleanupDeleteSummary: (processedCount, senderCount) =>
          `Se eliminaron permanentemente ${processedCount} mensaje(s) de ${senderCount} remitente(s).`,
        emptyTrashCompletedTitle: "Papelera vaciada",
        emptyTrashCompletedSummary: (deletedCount) =>
          deletedCount === 0
            ? "Tu Papelera de Gmail ya está vacía."
            : `Se eliminaron permanentemente ${deletedCount} mensaje(s) de la Papelera.`,
        emptyTrashErrorFallback: "No se pudo vaciar la Papelera de Gmail.",
        cleanupErrorFallback:
          "No se pudieron limpiar los mensajes seleccionados de Gmail.",
        undoButton: "Deshacer",
        undoingButton: "Deshaciendo...",
        undoCompletedTitle: "Devueltos a Recibidos",
        undoCompletedSummary: (messageCount, senderCount) =>
          `Se devolvieron ${messageCount} correo${messageCount === 1 ? "" : "s"} de ${senderCount} remitente${senderCount === 1 ? "" : "s"} a Recibidos.`,
        dismissAriaLabel: "Cerrar aviso",
        unsubscribedTitle: "Desuscripción completada",
        unsubscribedOneClickMessage: (senderEmail) =>
          `Te desuscribiste correctamente de ${senderEmail} mediante One-Click HTTP.`,
        unsubscribedMailtoMessage: (target, senderEmail) =>
          `Se envió correo de desuscripción a ${target} para ${senderEmail}.`,
        unsubscribeActionRequiredTitle: "Confirmación manual requerida",
        unsubscribeActionRequiredMessage: (senderEmail) =>
          `Se encontró un enlace de desuscripción para ${senderEmail}. Haz clic en "Completar desuscripción" en esa fila para terminar.`,
        unsubscribeNotFoundTitle: "No se encontró opción de desuscripción",
        unsubscribeNotFoundMessage: (senderEmail) =>
          `No se encontró cabecera List-Unsubscribe ni enlace de desuscripción en mensajes recientes de ${senderEmail}.`,
        unsubscribeErrorFallback: (senderEmail) =>
          `No se pudo desuscribir de ${senderEmail}.`,
        bulkUnsubscribeCompleteTitle: "Desuscripción masiva completada",
        bulkUnsubscribeStoppedTitle: "Desuscripción masiva detenida",
        bulkUnsubscribeSummaryMessage: (summary) =>
          `Desuscritos: ${summary.unsubscribed}, confirmación manual requerida: ${summary.manualRequired}, fallidos: ${summary.failed}${
            summary.notFound > 0 ? `, sin opción: ${summary.notFound}` : ""
          }.`,
        scanRateLimitFallback: "Se alcanzó el límite de cuota de Gmail.",
        scanErrorFallback: "No se pudo escanear tu bandeja de Gmail.",
      },
      keepSafeStrip: {
        ariaLabel: "Reglas activas de protección Keep safe",
        titleWithCount: (count) => `Keep safe (${count})`,
        description:
          "Los remitentes y dominios protegidos se excluyen de la selección masiva y limpieza:",
        removeAriaLabel: (pattern) => `Quitar ${pattern} de Keep safe`,
        scopeLabel: (scope) => {
          if (scope === "BRAND") return "marca";
          if (scope === "DOMAIN") return "dominio";
          return "remitente";
        },
        compactLink: (count) => `${count} protegidos · Gestionar`,
        emptyState:
          "Aún no hay remitentes, dominios ni marcas protegidas. Usa Proteger en cualquier remitente desde Limpiar para excluirlo de acciones masivas.",
      },
      autoClean: {
        ariaLabel: "Reglas de Auto-Clean y Bloqueo",
        title: "Reglas de Auto-Clean y Bloqueo",
        description:
          "Bloquea correos futuros con filtros nativos de Gmail a Papelera o guarda consultas de limpieza recurrentes para ejecutarlas bajo demanda.",
        saveCurrentFilter: "Guardar filtro actual como regla Auto-Clean",
        quickPresetsLabel: "Atajos rápidos:",
        presetLabels: {
          "promotions-90d": "Papelera Promociones > 90d",
          "spam-30d": "Papelera Spam > 30d",
          "social-90d": "Papelera Social > 90d",
        },
        currentFilterRuleLabel: (parts) =>
          `Papelera ${parts.join(" • ")}`.slice(0, 200),
        currentFilterWithAttachments: "con adjuntos",
        currentFilterUnreadOnly: "solo no leídos",
        emptyState:
          "Aún no hay reglas de Auto-Clean ni filtros de bloqueo configurados. Agrega un atajo rápido arriba, guarda un filtro de búsqueda activo o haz clic en Bloquear y Auto-Papelera en cualquier dominio o remitente.",
        ruleTypeLabel: (type) => {
          if (type === "BLOCK_SENDER") return "BLOQUEAR REMITENTE";
          if (type === "BLOCK_DOMAIN") return "BLOQUEAR DOMINIO";
          return "LIMPIEZA POR CONSULTA";
        },
        lastRunAtTitle: (formattedDateTime) =>
          `Última ejecución: ${formattedDateTime}`,
        notExecutedYet: "Aún no ejecutada",
        lastRunCount: (count) =>
          `Última ejecución: ${count} correo${count === 1 ? "" : "s"}`,
        gmailFilterActive: "Filtro activo en Gmail",
        blockRuleSaved: "Regla de bloqueo guardada",
        runNow: "Ejecutar ahora",
        remove: "Eliminar",
        toggleAutoClean: (isExpanded, count) => {
          if (isExpanded) return "Ocultar reglas";
          return count > 0 ? `Gestionar reglas (${count})` : "Configurar reglas";
        },
        builderTitle: "Constructor visual de reglas",
        builderCategoryLabel: "Categoría",
        builderAgeLabel: "Antigüedad",
        builderActionLabel: "Acción",
        builderScheduleLabel: "Frecuencia",
        builderConditionsLabel: "Condiciones",
        builderPreviewImpact: "Previsualizar impacto",
        builderPreviewLoading: "Previsualizando...",
        builderSaveRule: "Guardar regla",
        builderEmptyHint:
          "Selecciona al menos una categoría, antigüedad, no leídos o adjuntos.",
        actions: {
          trash: "Papelera",
          archive: "Archivar",
          mark_read: "Marcar como leído",
        },
        schedules: {
          manual: "Manual",
          daily: "Diaria",
          weekly: "Semanal",
        },
        statuses: {
          idle: "Pendiente",
          ok: "OK",
          success: "Éxito",
          error: "Error",
          auth_error: "Error de acceso",
          rate_limited: "Límite de tasa",
        },
        ruleEnabled: "Activa",
        rulePaused: "Pausada",
        pauseRule: "Pausar",
        resumeRule: "Reanudar",
        nextRunLabel: (formattedDateTime) =>
          `Próxima ejecución: ${formattedDateTime}`,
        manualScheduleHint: "Solo manual",
        previewSummary: (estimated, cleanable, protectedCount) =>
          `~${estimated} estimados · ${cleanable} limpiables en muestra · ${protectedCount} protegidos por Keep safe`,
        previewSampleSendersTitle: "Principales remitentes afectados",
        previewNoMatches: "No se encontraron correos que coincidan con esta regla.",
        previewProtectedBadge: "Protegido",
        previewSenderCount: (count) =>
          `${count} correo${count === 1 ? "" : "s"}`,
      },
      results: {
        selectAllAriaLabel: "Seleccionar todos los remitentes limpiables",
        selectAllLabel: (cleanableCount, protectedCount) =>
          `Seleccionar todo (${cleanableCount} remitente${
            cleanableCount === 1 ? "" : "s"
          }${protectedCount > 0 ? `, ${protectedCount} protegido${protectedCount === 1 ? "" : "s"}` : ""})`,
        viewGroupAriaLabel: "Vista de resultados",
        brandTree: "Árbol por Marca",
        flatSenders: "Lista Plana",
        cardsView: "Tarjetas",
        sortByLabel: "Ordenar por",
        sortOptions: {
          size: "Espacio usado",
          count: "Cantidad de correos",
          domains: "Cantidad de subdominios",
        },
        expandAll: "Expandir todo",
        collapseAll: "Contraer todo",
        movingToTrashStatus: "Moviendo mensajes a la Papelera...",
        archivingStatus: "Archivando mensajes...",
        markingAsReadStatus: "Marcando mensajes como leídos...",
        emptyingTrashStatus: "Vaciando Papelera...",
        deletingPermanentlyStatus: "Eliminando mensajes permanentemente...",
        moveToTrashWithCount: (count) => `Mover a Papelera (${count})`,
        archiveWithCount: (count) => `Archivar (${count})`,
        markAsReadWithCount: (count) => `Marcar como leído (${count})`,
        deletePermanentlyWithCount: (count) =>
          `Eliminar permanentemente (${count})`,
        emptyTrash: "Vaciar Papelera",
        clearSelection: "Limpiar selección",
        unsubscribableOnly: "Solo con desuscripción",
        unsubscribeSelectedWithCount: (count) =>
          `Desuscribir seleccionados (${count})`,
        unsubscribeSelectedNoneTitle:
          "Ningún remitente seleccionado tiene opción de desuscripción",
        bulkUnsubscribeProgress: (current, total, senderEmail) =>
          `Desuscribiendo ${current}/${total}: ${senderEmail}...`,
        stopBulkUnsubscribe: "Detener",
        selectionDockAriaLabel: "Acciones para remitentes seleccionados",
        selectionDockSummary: (
          senderCount,
          formattedSenders,
          messageCount,
          formattedMessages,
          sizeLabel,
        ) =>
          `${formattedSenders} remitente${senderCount === 1 ? "" : "s"} · ${formattedMessages} correo${messageCount === 1 ? "" : "s"} (${sizeLabel})`,
        scanProgressWithEstimate: (loaded, total, percent) =>
          `Cargando tus correos — ${loaded} de ~${total} correos (${percent}%)`,
        scanProgressGeneric: "Cargando tus correos...",
        scanProgressAriaLabel: "Progreso del escaneo de correos",
        stopScan: "Detener escaneo",
        scanProgressHint:
          "El escaneo puede tardar unos minutos según el volumen de mensajes. Los remitentes aparecen conforme cargan y puedes detenerlo cuando quieras.",
        scanningTitle: "Escaneando tu bandeja de Gmail...",
        scanningSubtitle:
          "Obteniendo metadatos de mensajes y agrupando remitentes por uso de espacio.",
        emptyTitle: "No se encontraron remitentes",
        emptySubtitle:
          "Prueba ajustar los filtros rápidos o la búsqueda y luego haz clic en Escanear bandeja.",
        resetFilters: "Restablecer filtros",
        loadedMoreSummary: (loaded, total, loadedNum) =>
          `Cargados ${loaded} correo${loadedNum === 1 ? "" : "s"}${
            total ? ` de ~${total}` : ""
          }. Hay más correos coincidentes disponibles.`,
        loadMore: "Cargar más",
        searchPlaceholder: "Buscar remitentes, marcas o dominios...",
        clearSearchAriaLabel: "Limpiar búsqueda",
        showMoreItems: (count) => `Mostrar ${count} más`,
        smallSendersSummary: (count) =>
          `${count} remitente${count === 1 ? "" : "s"} pequeño${count === 1 ? "" : "s"} (≤ 2 correos, < 500 KB)`,
        showSmallSenders: "Mostrar",
        hideSmallSenders: "Ocultar",
      },
      tree: {
        expandLabel: (name) => `Expandir ${name}`,
        collapseLabel: (name) => `Contraer ${name}`,
        selectCleanableInLabel: (name) =>
          `Seleccionar remitentes limpiables en ${name}`,
        selectSenderAriaLabel: (email) => `Seleccionar ${email}`,
        domainCount: (count, formatted) =>
          `${formatted} dominio${count === 1 ? "" : "s"}`,
        senderCount: (count, formatted) =>
          `${formatted} remitente${count === 1 ? "" : "s"}`,
        protectedCount: (count) =>
          `${count} protegido${count === 1 ? "" : "s"}`,
        emailCount: (count, formatted) =>
          `${formatted} correo${count === 1 ? "" : "s"}`,
        latestDate: (formattedDate) => `Último: ${formattedDate}`,
        unknownDate: "Fecha desconocida",
        keepSafeLabel: "Keep safe",
        protectedLabel: "Protegido",
        protectedByRuleTitle: (scope, pattern) => {
          const scopeText =
            scope === "BRAND"
              ? "marca"
              : scope === "DOMAIN"
                ? "dominio"
                : "remitente";
          return `Protegido por regla de ${scopeText}: ${pattern}`;
        },
        blockedInGmailLabel: "Bloqueado en Gmail",
        blockedInGmailDirectTitle: (pattern) =>
          `Bloqueado en Gmail: ${pattern}`,
        blockedInGmailDomainTitle: (pattern) =>
          `Bloqueado en Gmail por regla de dominio: ${pattern}`,
        blockAutoTrashLabel: "Bloquear y Auto-Papelera",
        blockProtectedTooltip:
          "Protegido con Keep safe. Quita la protección antes de bloquear.",
        blockAlreadyTooltip: "Ya está bloqueado en Gmail",
        blockActionTooltip:
          "Crear un filtro nativo en Gmail para enviar futuros correos a Papelera",
        unsubscribedOneClick: "Desuscrito (One-Click)",
        unsubscribedEmailSent: "Desuscrito (Correo enviado)",
        unsubscribeAvailable: "Desuscripción disponible",
        noUnsubscribeFound: "Sin enlace de desuscripción",
        noSubject: "(Sin asunto)",
        completeUnsubscribe: "Completar desuscripción",
        unsubscribing: "Desuscribiendo...",
        unsubscribe: "Desuscribir",
        viewEmails: "Ver correos",
        moveToTrash: "Mover a Papelera",
        archive: "Archivar",
        markAsRead: "Marcar como leído",
        deletePermanently: "Eliminar permanentemente",
        moreActionsLabel: "Más acciones",
        viewSubdomains: (count) => `Subdominios (${count})`,
        moreSubdomainsCount: (count) => `+${count} más`,
        brandSubdomainsTitle: (brandLabel) => `Subdominios de ${brandLabel}`,
      },
      onboarding: {
        ariaLabel: "Guía rápida de inicio",
        title: "Guía rápida",
        dismissAriaLabel: "Ocultar guía rápida",
        step1Title: "1. Protege",
        step1Desc: "Marca remitentes o dominios clave para no tocarlos.",
        step2Title: "2. Previsualiza",
        step2Desc: "Revisa correos de muestra antes de limpiar un remitente.",
        step3Title: "3. Limpia con Deshacer",
        step3Desc:
          "Mueve a la Papelera con calma y deshaz al instante si hace falta.",
      },
      previewModal: {
        closeAriaLabel: "Cerrar vista previa de correos",
        showingUpTo: (max, totalFormatted) =>
          `Mostrando hasta ${max} correos de ${totalFormatted} escaneados`,
        loadingList: "Cargando lista de correos...",
        emptyList: "No se encontraron correos previsualizables en este grupo.",
        loadingEmails: "Cargando correos...",
        selectEmailPrompt:
          "Selecciona un correo de la lista para ver su contenido.",
        loadingContent: "Cargando contenido del correo...",
        fromLabel: "De:",
        unknownSender: "Desconocido",
        toLabel: "Para:",
        dateLabel: "Fecha:",
        bodyFormatAriaLabel: "Formato del cuerpo del correo",
        formatted: "Con formato",
        plainText: "Texto plano",
        iframeTitle: "Vista previa del correo",
        noReadableContent: "(Sin contenido legible)",
        sendersInScope: (count, formatted) =>
          `${formatted} remitente${count === 1 ? "" : "s"} en alcance`,
        protectedKeptSafe: (count) =>
          `${count} protegido${count === 1 ? "" : "s"} a salvo`,
        close: "Cerrar",
        brandSubtitle: (domainCount, senderCount) =>
          `${domainCount} dominio${domainCount === 1 ? "" : "s"} • ${senderCount} remitente${senderCount === 1 ? "" : "s"}`,
        domainSubtitle: (senderCount) =>
          `${senderCount} remitente${senderCount === 1 ? "" : "s"}`,
      },
      permanentDeleteModal: {
        title: "Confirmar eliminación permanente",
        descriptionBeforeCount: "Esta acción elimina de forma permanente ",
        messageCountPhrase: (count, formatted) =>
          `${formatted} mensaje${count === 1 ? "" : "s"}`,
        descriptionBetweenSizeAndSenders: " de ",
        senderCountPhrase: (count) =>
          `${count} remitente${count === 1 ? "" : "s"}`,
        descriptionAfterSenders:
          ". Los mensajes eliminados omiten la Papelera y no se pueden recuperar.",
        keepingProtectedBefore: "Manteniendo a salvo ",
        keepingProtectedAfter: (count) =>
          ` mensaje${count === 1 ? "" : "s"} protegido${count === 1 ? "" : "s"}.`,
        confirmCheckboxLabel:
          "Entiendo que esto eliminará permanentemente estos mensajes de Gmail de inmediato y no se puede deshacer.",
        cancel: "Cancelar",
        deletePermanently: "Eliminar permanentemente",
      },
      emptyTrashModal: {
        title: "¿Vaciar la Papelera de Gmail?",
        description:
          "Esto eliminará permanentemente todos los mensajes que están actualmente en tu Papelera de Gmail. Los mensajes eliminados no se pueden recuperar.",
        cancel: "Cancelar",
        confirm: "Vaciar Papelera",
      },
      errors: {
        failedLoadMessageDetail: (status) =>
          `No se pudieron cargar los detalles del mensaje (HTTP ${status}).`,
        failedLoadMessageDetailFallback:
          "No se pudieron cargar los detalles del mensaje.",
        failedLoadPreviews: (status) =>
          `No se pudieron cargar las vistas previas (HTTP ${status}).`,
        failedLoadPreviewsFallback:
          "No se pudieron cargar las vistas previas.",
        failedScanInbox: (status) =>
          `No se pudo escanear la bandeja (HTTP ${status}).`,
        failedUpdateKeepSafe: (status) =>
          `No se pudo actualizar la regla Keep safe (HTTP ${status}).`,
        failedCreateAutoClean: (status) =>
          `No se pudo crear la regla Auto-Clean (HTTP ${status}).`,
        failedUpdateAutoClean: (status) =>
          `No se pudo actualizar la regla Auto-Clean (HTTP ${status}).`,
        failedPreviewAutoClean: (status) =>
          `No se pudo previsualizar la regla Auto-Clean (HTTP ${status}).`,
        failedRemoveAutoClean: (status) =>
          `No se pudo eliminar la regla Auto-Clean (HTTP ${status}).`,
        failedRunAutoClean: (status) =>
          `No se pudo ejecutar la regla Auto-Clean (HTTP ${status}).`,
        failedCleanMessages: (status) =>
          `No se pudieron limpiar los mensajes (HTTP ${status}).`,
        failedEmptyTrash: (status) =>
          `No se pudo vaciar la Papelera (HTTP ${status}).`,
        failedUnsubscribe: (email, status) =>
          `No se pudo desuscribir de ${email} (HTTP ${status}).`,
        failedLoadHistory: (status) =>
          `No se pudo cargar el historial de limpieza (HTTP ${status}).`,
      },
      cleanHistory: {
        title: "Historial de limpieza",
        subtitle:
          "Acciones recientes de limpieza y espacio recuperado en tu bandeja.",
        toggleLabel: (expanded, count) =>
          expanded ? "Ocultar historial" : `Ver historial (${count})`,
        emptyState: "Aún no hay acciones de limpieza registradas.",
        loading: "Actualizando historial...",
        columns: {
          date: "Fecha",
          action: "Acción",
          messages: "Mensajes",
          spaceFreed: "Espacio liberado",
        },
        actions: {
          trash: "Movido a Papelera",
          delete: "Eliminado permanentemente",
          untrash: "Restaurado de Papelera",
          archive: "Archivado",
          mark_read: "Marcado como leído",
          empty_trash: "Papelera vaciada",
        },
        messageCountLabel: (count, formatted) =>
          `${formatted} mensaje${count === 1 ? "" : "s"}`,
      },
    },
  },
};

export function getAppTranslations(lang: AppLanguage): AppTranslations {
  return TRANSLATIONS[lang];
}
