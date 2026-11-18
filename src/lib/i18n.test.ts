import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as I18nModule from "./i18n";

const {
  APP_LANGUAGES,
  APP_THEMES,
  DEFAULT_APP_LANGUAGE,
  DEFAULT_APP_THEME,
  isAppLanguage,
  isAppTheme,
  getIntlLocale,
  getAppTranslations,
} = (await import(
  new URL("./i18n.ts", import.meta.url).href
)) as typeof I18nModule;

type SampleInvocation = {
  path: string;
  fn: (...args: never[]) => unknown;
};

function collectLeafEntries(
  value: unknown,
  prefix = "",
  strings: Array<{ path: string; value: string }> = [],
  functions: SampleInvocation[] = [],
): {
  strings: Array<{ path: string; value: string }>;
  functions: SampleInvocation[];
  keys: string[];
} {
  const keys: string[] = [];

  function walk(node: unknown, currentPath: string): void {
    if (typeof node === "string") {
      keys.push(currentPath);
      strings.push({ path: currentPath, value: node });
      return;
    }

    if (typeof node === "function") {
      keys.push(currentPath);
      functions.push({
        path: currentPath,
        fn: node as (...args: never[]) => unknown,
      });
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, `${currentPath}[${index}]`);
      });
      return;
    }

    if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      for (const key of Object.keys(record).sort()) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        walk(record[key], nextPath);
      }
      return;
    }

    assert.fail(`Unexpected value type at ${currentPath}: ${typeof node}`);
  }

  walk(value, prefix);
  return { strings, functions, keys };
}

function invokeFormatterSamples(
  t: ReturnType<typeof getAppTranslations>,
): Record<string, string[]> {
  return {
    "privacyModal.connectedSubtitle": [
      t.privacyModal.connectedSubtitle("user@example.com"),
    ],
    "dashboard.passExpires": [t.dashboard.passExpires("Nov 16, 2026")],
    "dashboard.passStatusLabel": [
      t.dashboard.passStatusLabel("TRIAL"),
      t.dashboard.passStatusLabel("ACTIVE"),
      t.dashboard.passStatusLabel("EXPIRED"),
    ],
    "dashboard.summary.emailsCleaned": [
      t.dashboard.summary.emailsCleaned("1,240"),
    ],
    "dashboard.summary.queryPrefix": [
      t.dashboard.summary.queryPrefix("category:promotions"),
    ],
    "dashboard.summary.sortedBy": [
      t.dashboard.summary.sortedBy("Storage used"),
    ],
    "dashboard.summary.senderCount": [
      t.dashboard.summary.senderCount(0, "0"),
      t.dashboard.summary.senderCount(1, "1"),
      t.dashboard.summary.senderCount(5, "5"),
    ],
    "dashboard.summary.emailCountSummary": [
      t.dashboard.summary.emailCountSummary(1, "1", "12.0 KB"),
      t.dashboard.summary.emailCountSummary(42, "42", "1.5 MB"),
    ],
    "dashboard.summary.compactScanned": [
      t.dashboard.summary.compactScanned("0"),
      t.dashboard.summary.compactScanned("1,250"),
    ],
    "dashboard.summary.compactSendersSize": [
      t.dashboard.summary.compactSendersSize(1, "1", "12.0 KB"),
      t.dashboard.summary.compactSendersSize(42, "42", "1.5 GB"),
    ],
    "dashboard.summary.compactReclaimed": [
      t.dashboard.summary.compactReclaimed("0 B"),
      t.dashboard.summary.compactReclaimed("350.2 MB"),
    ],
    "dashboard.banners.keepSafeRemovedMessage": [
      t.dashboard.banners.keepSafeRemovedMessage("example.com", "domain"),
    ],
    "dashboard.banners.keepSafeEnabledMessage": [
      t.dashboard.banners.keepSafeEnabledMessage("example.com", "domain"),
    ],
    "dashboard.banners.autoCleanSavedMessage": [
      t.dashboard.banners.autoCleanSavedMessage("Trash Promotions > 90d"),
    ],
    "dashboard.banners.blockedInGmailMessage": [
      t.dashboard.banners.blockedInGmailMessage("spam@example.com"),
    ],
    "dashboard.banners.autoCleanRemovedMessage": [
      t.dashboard.banners.autoCleanRemovedMessage("Trash Promotions > 90d"),
    ],
    "dashboard.banners.blockFilterRemovedMessage": [
      t.dashboard.banners.blockFilterRemovedMessage("example.com"),
    ],
    "dashboard.banners.autoCleanCompletedMovedMessage": [
      t.dashboard.banners.autoCleanCompletedMovedMessage(
        12,
        "Trash Spam",
        "",
      ),
    ],
    "dashboard.banners.autoCleanCompletedNoneMessage": [
      t.dashboard.banners.autoCleanCompletedNoneMessage("Trash Spam", ""),
    ],
    "dashboard.banners.keptProtectedNote": [
      t.dashboard.banners.keptProtectedNote(3),
    ],
    "dashboard.banners.protectedKeptSafeNoActionMessage": [
      t.dashboard.banners.protectedKeptSafeNoActionMessage(2, "trash"),
      t.dashboard.banners.protectedKeptSafeNoActionMessage(2, "archive"),
      t.dashboard.banners.protectedKeptSafeNoActionMessage(2, "mark_read"),
      t.dashboard.banners.protectedKeptSafeNoActionMessage(2, "delete"),
    ],
    "dashboard.banners.cleanupTrashSummary": [
      t.dashboard.banners.cleanupTrashSummary(10, 2),
    ],
    "dashboard.banners.cleanupArchiveSummary": [
      t.dashboard.banners.cleanupArchiveSummary(10, 2),
    ],
    "dashboard.banners.cleanupMarkReadSummary": [
      t.dashboard.banners.cleanupMarkReadSummary(10, 2),
    ],
    "dashboard.banners.cleanupDeleteSummary": [
      t.dashboard.banners.cleanupDeleteSummary(10, 2),
    ],
    "dashboard.banners.emptyTrashCompletedSummary": [
      t.dashboard.banners.emptyTrashCompletedSummary(0),
      t.dashboard.banners.emptyTrashCompletedSummary(15),
    ],
    "dashboard.banners.undoCompletedSummary": [
      t.dashboard.banners.undoCompletedSummary(1, 1),
      t.dashboard.banners.undoCompletedSummary(10, 2),
    ],
    "dashboard.banners.unsubscribedOneClickMessage": [
      t.dashboard.banners.unsubscribedOneClickMessage("news@example.com"),
    ],
    "dashboard.banners.unsubscribedMailtoMessage": [
      t.dashboard.banners.unsubscribedMailtoMessage(
        "leave@example.com",
        "news@example.com",
      ),
    ],
    "dashboard.banners.unsubscribeActionRequiredMessage": [
      t.dashboard.banners.unsubscribeActionRequiredMessage("news@example.com"),
    ],
    "dashboard.banners.unsubscribeNotFoundMessage": [
      t.dashboard.banners.unsubscribeNotFoundMessage("news@example.com"),
    ],
    "dashboard.banners.unsubscribeErrorFallback": [
      t.dashboard.banners.unsubscribeErrorFallback("news@example.com"),
    ],
    "dashboard.banners.bulkUnsubscribeSummaryMessage": [
      t.dashboard.banners.bulkUnsubscribeSummaryMessage({
        unsubscribed: 2,
        manualRequired: 1,
        notFound: 0,
        failed: 0,
      }),
      t.dashboard.banners.bulkUnsubscribeSummaryMessage({
        unsubscribed: 1,
        manualRequired: 0,
        notFound: 1,
        failed: 1,
      }),
    ],
    "dashboard.keepSafeStrip.titleWithCount": [
      t.dashboard.keepSafeStrip.titleWithCount(3),
    ],
    "dashboard.keepSafeStrip.removeAriaLabel": [
      t.dashboard.keepSafeStrip.removeAriaLabel("example.com"),
    ],
    "dashboard.keepSafeStrip.scopeLabel": [
      t.dashboard.keepSafeStrip.scopeLabel("BRAND"),
      t.dashboard.keepSafeStrip.scopeLabel("DOMAIN"),
      t.dashboard.keepSafeStrip.scopeLabel("SENDER"),
    ],
    "dashboard.keepSafeStrip.compactLink": [
      t.dashboard.keepSafeStrip.compactLink(0),
      t.dashboard.keepSafeStrip.compactLink(4),
    ],
    "dashboard.autoClean.currentFilterRuleLabel": [
      t.dashboard.autoClean.currentFilterRuleLabel(["Promotions", "> 6m"]),
    ],
    "dashboard.autoClean.ruleTypeLabel": [
      t.dashboard.autoClean.ruleTypeLabel("BLOCK_SENDER"),
      t.dashboard.autoClean.ruleTypeLabel("BLOCK_DOMAIN"),
      t.dashboard.autoClean.ruleTypeLabel("CLEAN_QUERY"),
    ],
    "dashboard.autoClean.lastRunAtTitle": [
      t.dashboard.autoClean.lastRunAtTitle("Nov 16, 2026, 10:00 AM"),
    ],
    "dashboard.autoClean.lastRunCount": [
      t.dashboard.autoClean.lastRunCount(0),
      t.dashboard.autoClean.lastRunCount(1),
      t.dashboard.autoClean.lastRunCount(7),
    ],
    "dashboard.autoClean.toggleAutoClean": [
      t.dashboard.autoClean.toggleAutoClean(false, 0),
      t.dashboard.autoClean.toggleAutoClean(false, 3),
      t.dashboard.autoClean.toggleAutoClean(true, 3),
    ],
    "dashboard.autoClean.nextRunLabel": [
      t.dashboard.autoClean.nextRunLabel("Nov 18, 2026, 10:00 AM"),
    ],
    "dashboard.autoClean.previewSummary": [
      t.dashboard.autoClean.previewSummary(120, 85, 15),
    ],
    "dashboard.autoClean.previewSenderCount": [
      t.dashboard.autoClean.previewSenderCount(1),
      t.dashboard.autoClean.previewSenderCount(12),
    ],
    "dashboard.results.selectAllLabel": [
      t.dashboard.results.selectAllLabel(1, 0),
      t.dashboard.results.selectAllLabel(5, 2),
    ],
    "dashboard.results.moveToTrashWithCount": [
      t.dashboard.results.moveToTrashWithCount(14),
    ],
    "dashboard.results.archiveWithCount": [
      t.dashboard.results.archiveWithCount(14),
    ],
    "dashboard.results.markAsReadWithCount": [
      t.dashboard.results.markAsReadWithCount(14),
    ],
    "dashboard.results.deletePermanentlyWithCount": [
      t.dashboard.results.deletePermanentlyWithCount(14),
    ],
    "dashboard.results.unsubscribeSelectedWithCount": [
      t.dashboard.results.unsubscribeSelectedWithCount(3),
    ],
    "dashboard.results.bulkUnsubscribeProgress": [
      t.dashboard.results.bulkUnsubscribeProgress(2, 5, "news@example.com"),
    ],
    "dashboard.results.selectionDockSummary": [
      t.dashboard.results.selectionDockSummary(1, "1", 1, "1", "12.0 KB"),
      t.dashboard.results.selectionDockSummary(3, "3", 45, "45", "4.2 MB"),
    ],
    "dashboard.results.scanProgressWithEstimate": [
      t.dashboard.results.scanProgressWithEstimate("500", "2,000", 25),
    ],
    "dashboard.results.loadedMoreSummary": [
      t.dashboard.results.loadedMoreSummary("100", "500", 100),
      t.dashboard.results.loadedMoreSummary("1", null, 1),
    ],
    "dashboard.results.showMoreItems": [
      t.dashboard.results.showMoreItems(20),
    ],
    "dashboard.results.smallSendersSummary": [
      t.dashboard.results.smallSendersSummary(1),
      t.dashboard.results.smallSendersSummary(14),
    ],
    "dashboard.tree.expandLabel": [
      t.dashboard.tree.expandLabel("Aliexpress"),
    ],
    "dashboard.tree.collapseLabel": [
      t.dashboard.tree.collapseLabel("Aliexpress"),
    ],
    "dashboard.tree.selectCleanableInLabel": [
      t.dashboard.tree.selectCleanableInLabel("mail.aliexpress.com"),
    ],
    "dashboard.tree.selectSenderAriaLabel": [
      t.dashboard.tree.selectSenderAriaLabel("deals@example.com"),
    ],
    "dashboard.tree.domainCount": [
      t.dashboard.tree.domainCount(1, "1"),
      t.dashboard.tree.domainCount(3, "3"),
    ],
    "dashboard.tree.senderCount": [
      t.dashboard.tree.senderCount(1, "1"),
      t.dashboard.tree.senderCount(4, "4"),
    ],
    "dashboard.tree.protectedCount": [
      t.dashboard.tree.protectedCount(1),
      t.dashboard.tree.protectedCount(2),
    ],
    "dashboard.tree.emailCount": [
      t.dashboard.tree.emailCount(1, "1"),
      t.dashboard.tree.emailCount(9, "9"),
    ],
    "dashboard.tree.latestDate": [t.dashboard.tree.latestDate("Nov 16, 2026")],
    "dashboard.tree.protectedByRuleTitle": [
      t.dashboard.tree.protectedByRuleTitle("BRAND", "aliexpress"),
      t.dashboard.tree.protectedByRuleTitle("DOMAIN", "notice.aliexpress.com"),
      t.dashboard.tree.protectedByRuleTitle("SENDER", "orders@example.com"),
    ],
    "dashboard.tree.blockedInGmailDirectTitle": [
      t.dashboard.tree.blockedInGmailDirectTitle("spam@example.com"),
    ],
    "dashboard.tree.blockedInGmailDomainTitle": [
      t.dashboard.tree.blockedInGmailDomainTitle("spam.example.com"),
    ],
    "dashboard.tree.viewSubdomains": [
      t.dashboard.tree.viewSubdomains(1),
      t.dashboard.tree.viewSubdomains(5),
    ],
    "dashboard.tree.moreSubdomainsCount": [
      t.dashboard.tree.moreSubdomainsCount(2),
    ],
    "dashboard.tree.brandSubdomainsTitle": [
      t.dashboard.tree.brandSubdomainsTitle("Aliexpress"),
    ],
    "dashboard.previewModal.showingUpTo": [
      t.dashboard.previewModal.showingUpTo(30, "120"),
    ],
    "dashboard.previewModal.sendersInScope": [
      t.dashboard.previewModal.sendersInScope(1, "1"),
      t.dashboard.previewModal.sendersInScope(3, "3"),
    ],
    "dashboard.previewModal.protectedKeptSafe": [
      t.dashboard.previewModal.protectedKeptSafe(1),
      t.dashboard.previewModal.protectedKeptSafe(2),
    ],
    "dashboard.previewModal.brandSubtitle": [
      t.dashboard.previewModal.brandSubtitle(1, 2),
    ],
    "dashboard.previewModal.domainSubtitle": [
      t.dashboard.previewModal.domainSubtitle(1),
      t.dashboard.previewModal.domainSubtitle(4),
    ],
    "dashboard.permanentDeleteModal.messageCountPhrase": [
      t.dashboard.permanentDeleteModal.messageCountPhrase(1, "1"),
      t.dashboard.permanentDeleteModal.messageCountPhrase(25, "25"),
    ],
    "dashboard.permanentDeleteModal.senderCountPhrase": [
      t.dashboard.permanentDeleteModal.senderCountPhrase(1),
      t.dashboard.permanentDeleteModal.senderCountPhrase(3),
    ],
    "dashboard.permanentDeleteModal.keepingProtectedAfter": [
      t.dashboard.permanentDeleteModal.keepingProtectedAfter(1),
      t.dashboard.permanentDeleteModal.keepingProtectedAfter(4),
    ],
    "dashboard.errors.failedLoadMessageDetail": [
      t.dashboard.errors.failedLoadMessageDetail(500),
    ],
    "dashboard.errors.failedLoadPreviews": [
      t.dashboard.errors.failedLoadPreviews(500),
    ],
    "dashboard.errors.failedScanInbox": [
      t.dashboard.errors.failedScanInbox(429),
    ],
    "dashboard.errors.failedUpdateKeepSafe": [
      t.dashboard.errors.failedUpdateKeepSafe(500),
    ],
    "dashboard.errors.failedCreateAutoClean": [
      t.dashboard.errors.failedCreateAutoClean(403),
    ],
    "dashboard.errors.failedUpdateAutoClean": [
      t.dashboard.errors.failedUpdateAutoClean(400),
    ],
    "dashboard.errors.failedPreviewAutoClean": [
      t.dashboard.errors.failedPreviewAutoClean(502),
    ],
    "dashboard.errors.failedRemoveAutoClean": [
      t.dashboard.errors.failedRemoveAutoClean(403),
    ],
    "dashboard.errors.failedRunAutoClean": [
      t.dashboard.errors.failedRunAutoClean(500),
    ],
    "dashboard.errors.failedCleanMessages": [
      t.dashboard.errors.failedCleanMessages(500),
    ],
    "dashboard.errors.failedEmptyTrash": [
      t.dashboard.errors.failedEmptyTrash(500),
    ],
    "dashboard.errors.failedUnsubscribe": [
      t.dashboard.errors.failedUnsubscribe("news@example.com", 502),
    ],
    "dashboard.errors.failedLoadHistory": [
      t.dashboard.errors.failedLoadHistory(500),
    ],
    "dashboard.cleanHistory.toggleLabel": [
      t.dashboard.cleanHistory.toggleLabel(false, 4),
      t.dashboard.cleanHistory.toggleLabel(true, 4),
    ],
    "dashboard.cleanHistory.messageCountLabel": [
      t.dashboard.cleanHistory.messageCountLabel(1, "1"),
      t.dashboard.cleanHistory.messageCountLabel(12, "12"),
    ],
  };
}

describe("i18n constants and helpers", () => {
  it("exports expected languages, themes, defaults, and type guards", () => {
    assert.deepEqual(APP_LANGUAGES, ["en", "es"]);
    assert.deepEqual(APP_THEMES, ["dark", "light"]);
    assert.equal(DEFAULT_APP_LANGUAGE, "en");
    assert.equal(DEFAULT_APP_THEME, "dark");

    assert.equal(isAppLanguage("en"), true);
    assert.equal(isAppLanguage("es"), true);
    assert.equal(isAppLanguage("fr"), false);
    assert.equal(isAppLanguage(null), false);

    assert.equal(isAppTheme("dark"), true);
    assert.equal(isAppTheme("light"), true);
    assert.equal(isAppTheme("system"), false);
    assert.equal(isAppTheme(undefined), false);

    assert.equal(getIntlLocale("en"), "en-US");
    assert.equal(getIntlLocale("es"), "es-MX");
  });
});

describe("getAppTranslations parity", () => {
  it("has identical translation keys and non-empty strings across en and es", () => {
    const enTree = collectLeafEntries(getAppTranslations("en"));
    const esTree = collectLeafEntries(getAppTranslations("es"));

    assert.deepEqual(esTree.keys, enTree.keys);

    for (const entry of enTree.strings) {
      assert.ok(
        entry.value.trim().length > 0,
        `English string at ${entry.path} must not be empty`,
      );
    }

    for (const entry of esTree.strings) {
      assert.ok(
        entry.value.trim().length > 0,
        `Spanish string at ${entry.path} must not be empty`,
      );
    }
  });

  it("covers every formatter function in en and es with non-empty outputs", () => {
    for (const lang of APP_LANGUAGES) {
      const translations = getAppTranslations(lang);
      const tree = collectLeafEntries(translations);
      const samples = invokeFormatterSamples(translations);

      assert.deepEqual(
        Object.keys(samples).sort(),
        tree.functions.map((f) => f.path).sort(),
      );

      for (const [path, outputs] of Object.entries(samples)) {
        for (const output of outputs) {
          assert.equal(typeof output, "string", `${lang}.${path} must return string`);
          assert.ok(
            output.trim().length > 0,
            `${lang}.${path} returned an empty string`,
          );
          assert.equal(
            output.includes("undefined"),
            false,
            `${lang}.${path} contains "undefined": ${output}`,
          );
          assert.equal(
            output.includes("NaN"),
            false,
            `${lang}.${path} contains "NaN": ${output}`,
          );
        }
      }
    }
  });

  it("provides bilingual dashboard polish copy for dock, auto-clean toggle, and filter reset", () => {
    const en = getAppTranslations("en").dashboard;
    const es = getAppTranslations("es").dashboard;

    assert.equal(en.results.clearSelection, "Clear selection");
    assert.equal(es.results.clearSelection, "Limpiar selección");

    assert.equal(en.results.resetFilters, "Reset filters");
    assert.equal(es.results.resetFilters, "Restablecer filtros");

    assert.ok(en.results.selectionDockAriaLabel.length > 0);
    assert.ok(es.results.selectionDockAriaLabel.length > 0);
    assert.notEqual(en.results.selectionDockAriaLabel, es.results.selectionDockAriaLabel);

    assert.match(
      en.results.selectionDockSummary(1, "1", 1, "1", "10.0 KB"),
      /1 sender.*1 email.*10\.0 KB/,
    );
    assert.match(
      es.results.selectionDockSummary(2, "2", 5, "5", "2.4 MB"),
      /2 remitentes.*5 correos.*2\.4 MB/,
    );

    assert.equal(en.autoClean.toggleAutoClean(false, 2), "Manage rules (2)");
    assert.equal(en.autoClean.toggleAutoClean(true, 2), "Hide rules");
    assert.equal(es.autoClean.toggleAutoClean(false, 2), "Gestionar reglas (2)");
    assert.equal(es.autoClean.toggleAutoClean(true, 2), "Ocultar reglas");

    assert.equal(en.banners.undoButton, "Undo");
    assert.equal(es.banners.undoButton, "Deshacer");
    assert.equal(en.banners.dismissAriaLabel, "Dismiss notice");
    assert.equal(es.banners.dismissAriaLabel, "Cerrar aviso");
    assert.equal(en.tree.moreActionsLabel, "More actions");
    assert.equal(es.tree.moreActionsLabel, "Más acciones");
    assert.ok(en.onboarding.title.length > 0);
    assert.ok(es.onboarding.title.length > 0);

    assert.equal(en.filters.presets.social, "Social");
    assert.equal(es.filters.presets.social, "Social");
    assert.equal(en.filters.presets.updates, "Updates");
    assert.equal(es.filters.presets.updates, "Notificaciones");
    assert.equal(en.filters.unreadOnly, "Unread only");
    assert.equal(es.filters.unreadOnly, "Solo no leídos");
    assert.equal(en.results.unsubscribableOnly, "Unsubscribable only");
    assert.equal(es.results.unsubscribableOnly, "Solo con desuscripción");
    assert.equal(en.results.cardsView, "Cards");
    assert.equal(es.results.cardsView, "Tarjetas");
    assert.equal(
      en.results.unsubscribeSelectedWithCount(4),
      "Unsubscribe selected (4)",
    );
    assert.equal(
      es.results.unsubscribeSelectedWithCount(4),
      "Desuscribir seleccionados (4)",
    );

    assert.equal(en.cleanHistory.title, "Clean Activity");
    assert.equal(es.cleanHistory.title, "Historial de limpieza");
    assert.equal(en.cleanHistory.toggleLabel(false, 3), "Show activity (3)");
    assert.equal(es.cleanHistory.toggleLabel(false, 3), "Ver historial (3)");
    assert.equal(en.cleanHistory.toggleLabel(true, 3), "Hide activity");
    assert.equal(es.cleanHistory.toggleLabel(true, 3), "Ocultar historial");
  });

  it("provides bilingual dashboard navigation, account menu, filters popover, and compact keep-safe copy", () => {
    const en = getAppTranslations("en").dashboard;
    const es = getAppTranslations("es").dashboard;

    assert.equal(en.tabs.clean, "Clean");
    assert.equal(es.tabs.clean, "Limpiar");
    assert.equal(en.tabs.rules, "Auto-Clean & Protected");
    assert.equal(es.tabs.rules, "Auto-Clean y Protegidos");
    assert.equal(en.tabs.history, "History");
    assert.equal(es.tabs.history, "Historial");

    assert.equal(en.accountMenu.buttonLabel, "Account");
    assert.equal(es.accountMenu.buttonLabel, "Cuenta");
    assert.equal(en.filters.filtersButton, "Filters");
    assert.equal(es.filters.filtersButton, "Filtros");
    assert.equal(en.keepSafeStrip.compactLink(3), "3 protected · Manage");
    assert.equal(es.keepSafeStrip.compactLink(3), "3 protegidos · Gestionar");
  });
});
