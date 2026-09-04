/* ---- Store facade assembly — must load last ---- */
'use strict';

  window.Store = {
    CATEGORIES, TYPES, DEBT_TYPES, CSV_HEADER, SHARED, uid,
    get WHO() { return WHO(); },
    get data() { return data; },
    members, addMember, renameMember, removeMember,
    load, save, reset, replace, startFresh,
    touchTransactions, needsExport, markExported,
    fmt$, fmtPct, fmtDate, fmtMonth, usDate, isoFromUs, thisMonth, addMonths, MONTHS,
    budgetTotal, incomeTotal, surplus, savingsRate,
    budgetByCategory, budgetByPerson,
    txInMonth, spendByCategory, spendByWho, spendByDay, monthsWithData,
    goalMeta, houseScenario, rothMeta, hysaProjection,
    paydaysInMonth, paydaysInMonthAll, fundingPaycheck, paycheckAllocations,
    goalsProgress, insights, householdSnapshot,
    saveForecastScenario, deleteForecastScenario,
    parseCSV, exportCSV, csvEscape,
    monthPace, safeToSpend, avgSpendByCategory, categoryTrends, priceCreeps, unusualTx,
    subscriptionNudges, markSubscriptionReviewed, recurringSeries,
    prevMonth, nextMonth, daysInMonth, monthSchedule,
    dueSoonItems, dueForReminder, markReminded, dueInsightNudges, markInsightsNudged,
    closeChecklist, monthSummary, closeMonth,
    balanceAt, latestBalance, netWorthSeries, saveSnapshot, debtPayoff, forecast, estimatedBalance, reconcileAccount,
    debtStrategies, debtStrategiesSummary, debtPayoffOrder, debtRollupPlan, debtPayoffOrderComparison,
    normalizeMerchant, merchantKey, prettyMerchant,
    ruleFor, suggestRule, learnRule, previewRule, suggestedRuleMerchants,
    applySplit, clearSplit,
    guessCategory, categorize, likelyDuplicate,
    matchBudgetLine, budgetLineStatus,
    effectiveBudget, rolloverAdjustmentTotal, autoPostDueBills, underBudgetStreak,
    flexGroups, flexGroupNames, moveFlexAmount,
    addImportBatch, undoImportBatch, integrityCheck
  };
  load();
