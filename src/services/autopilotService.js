// abTestingService and promotionService are required lazily inside methods that need them
const { calculateConfidenceForVariants } = require("../utils/statistics");
// `admin` and `db` are required lazily in operations that need Firestore.

class AutopilotService {
  calculateVariantScore(metrics) {
    return (
      (metrics.views || 0) * 0.3 +
      (metrics.engagement || 0) * 0.3 +
      (metrics.conversions || 0) * 0.2 +
      (metrics.revenue || 0) * 0.2
    );
  }

  buildCanaryScheduleData(testData, winningVariant, options = {}) {
    const prevBudget =
      (testData &&
        testData.autopilot &&
        testData.autopilot.previousPromotionSettings &&
        testData.autopilot.previousPromotionSettings.budget) ||
      0;
    const newBudget =
      (winningVariant.promotionSettings && winningVariant.promotionSettings.budget) ||
      prevBudget ||
      0;
    const canaryPct = options && typeof options.canaryPct === "number" ? options.canaryPct : 0;
    const rampHours = options && typeof options.rampHours === "number" ? options.rampHours : 24;
    const canaryBudget =
      prevBudget > 0
        ? Math.max(1, Math.round(prevBudget * (canaryPct / 100)))
        : Math.max(1, Math.round(newBudget * (canaryPct / 100)));
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + rampHours * 60 * 60 * 1000);
    const schedule = {
      platform:
        (winningVariant.promotionSettings && winningVariant.promotionSettings.platform) ||
        undefined,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      budget: canaryBudget,
      is_active: true,
    };
    return schedule;
  }
  decideAutoApply(testData) {
    if (!testData || !testData.autopilot || !testData.autopilot.enabled)
      return { shouldApply: false, reason: "autopilot_disabled" };
    const minSample = testData.autopilot.minSample || 100;
    const threshold =
      typeof testData.autopilot.confidenceThreshold === "number"
        ? testData.autopilot.confidenceThreshold
        : 95;

    const totalViews = (testData.variants || []).reduce((s, v) => s + (v.metrics.views || 0), 0);
    if (totalViews < minSample)
      return { shouldApply: false, reason: "min_sample_not_met", totalViews };

    // Determine top variant by score (reusing existing scoring)
    const variantScores = testData.variants.map(variant => ({
      variantId: variant.id,
      score: this.calculateVariantScore(variant.metrics || {}),
    }));
    const winner = variantScores.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));

    const confidence = calculateConfidenceForVariants(testData.variants || []);
    const { generatePosteriorSamplesForTopVsBaseline } = require("../utils/statistics");
    // generate a small sample to use for preview histograms and percentiles
    const sampleArray = generatePosteriorSamplesForTopVsBaseline(testData.variants || [], 400);
    const sortedSamples = (sampleArray || []).slice().sort((a, b) => a - b);
    const percentile = p => {
      if (!sortedSamples.length) return 0;
      const idx = Math.floor((sortedSamples.length - 1) * p);
      return sortedSamples[idx];
    };
    const p50 = percentile(0.5);
    const p95 = percentile(0.95);
    // compute predicted uplift: percent increase in conversions if top variant is applied vs baseline
    const rates = testData.variants.map(v => ({
      id: v.id,
      conversions: v.metrics.conversions || 0,
      views: v.metrics.views || 0,
      rate: v.metrics.views ? (v.metrics.conversions || 0) / v.metrics.views : 0,
      revenue: v.metrics.revenue || 0,
    }));
    const top = rates.reduce((p, c) => (c.rate > p.rate ? c : p), rates[0]);
    const others = rates.filter(r => r.id !== top.id);
    const baselineConversionsPerView =
      others.reduce((acc, r) => acc + r.conversions / (r.views || 1), 0) / (others.length || 1);
    const topRate = (top.conversions || 0) / (top.views || 1);
    const predictedUplift = baselineConversionsPerView
      ? ((topRate - baselineConversionsPerView) / baselineConversionsPerView) * 100
      : 0;
    const incConversionsPer1000Views = (topRate - baselineConversionsPerView) * 1000;
    // estimate revenue per conversion from provided metrics (fallback to 0)
    const avgRevenuePerConversion =
      top.conversions > 0
        ? (top.revenue || 0) / (top.conversions || 1)
        : others.reduce(
            (acc, r) => acc + (r.conversions ? (r.revenue || 0) / r.conversions : 0),
            0
          ) / (others.length || 1);
    const estimatedRevenueChangePer1000Views =
      incConversionsPer1000Views * (avgRevenuePerConversion || 0);

    // risk score: derived from confidence but penalize small total views
    const sampleSafety = Math.max(
      0,
      Math.min(
        1,
        totalViews / Math.max(1, (testData.autopilot && testData.autopilot.minSample) || 100)
      )
    );
    const riskScore = Math.max(
      0,
      Math.min(100, Math.round((1 - confidence / 100 + (1 - sampleSafety)) * 100))
    );

    const simulation = {
      samples: sampleArray,
      p50,
      p95,
    };
    if (confidence >= threshold) {
      return {
        shouldApply: true,
        winner: winner.variantId,
        confidence,
        reason: "above_threshold",
        predictedUplift,
        incConversionsPer1000Views,
        estimatedRevenueChangePer1000Views,
        baselineRate: baselineConversionsPerView,
        topRate,
        riskScore,
        simulation,
      };
    }
    return {
      shouldApply: false,
      winner: winner.variantId,
      confidence,
      reason: "below_threshold",
      predictedUplift,
      incConversionsPer1000Views,
      estimatedRevenueChangePer1000Views,
      baselineRate: baselineConversionsPerView,
      topRate,
      riskScore,
      simulation,
    };
  }

  canApplyAuto(testData) {
    if (!testData || !testData.autopilot) return false;
    if (!testData.autopilot.enabled) return false;
    if (testData.autopilot.requiresApproval && !testData.autopilot.approvedBy) return false;
    return true;
  }

  async applyAuto(testId, options = {}) {
    const { admin, db } = require("../firebaseAdmin");
    // Fetch test doc
    const testRef = db.collection("ab_tests").doc(testId);
    const snap = await testRef.get();
    if (!snap.exists) throw new Error("Test not found");
    const testData = snap.data();

    const decision = this.decideAutoApply(testData);
    if (!decision.shouldApply) return { applied: false, decision };
    // determine the winning variant id up-front (if present in decision)
    const winningVariantIdFromDecision = decision && decision.winner ? decision.winner : null;
    if (!this.canApplyAuto(testData)) {
      // Log a reason and return not applied when approval is required
      await testRef.update({
        autopilotActions:
          admin && admin.firestore && admin.firestore.FieldValue
            ? admin.firestore.FieldValue.arrayUnion({
                variantId: winningVariantIdFromDecision,
                confidence: decision.confidence,
                triggeredAt: new Date(),
                reason: "autopilot_rejected_requires_approval",
              })
            : (testData.autopilotActions || []).concat({
                variantId: winningVariantIdFromDecision,
                confidence: decision.confidence,
                triggeredAt: new Date(),
                reason: "autopilot_rejected_requires_approval",
              }),
      });
      return { applied: false, decision, reason: "requires_approval" };
    }

    // Before applying, gather current state to allow rollback
    const contentId = testData.contentId;
    const contentRef = db.collection("content").doc(contentId);
    const contentSnap = await contentRef.get();
    const contentData = contentSnap.exists ? contentSnap.data() : {};
    const previousPromotionSettings = contentData.optimizedPromotionSettings || null;

    // Determine winner and apply via the AB testing engine
    // Determine winner using local scoring to intercept promotion settings and apply safety checks
    const variantScores = testData.variants.map(variant => ({
      variantId: variant.id,
      score: this.calculateVariantScore(variant.metrics || {}),
      variant,
    }));
    const winnerObj = variantScores.reduce(
      (prev, curr) => (curr.score > prev.score ? curr : prev),
      variantScores[0]
    );
    const winningVariantId = winnerObj.variantId;
    const winningVariant = winnerObj.variant;

    // Budget safety checks
    const prevBudget = (previousPromotionSettings && previousPromotionSettings.budget) || 0;
    const newBudget =
      (winningVariant.promotionSettings && winningVariant.promotionSettings.budget) || prevBudget;
    const maxChange =
      testData.autopilot && typeof testData.autopilot.maxBudgetChangePercent === "number"
        ? testData.autopilot.maxBudgetChangePercent
        : 10;
    const allowIncrease = !!(testData.autopilot && testData.autopilot.allowBudgetIncrease);
    const percentChange = prevBudget > 0 ? ((newBudget - prevBudget) / prevBudget) * 100 : 0;
    if (!allowIncrease && percentChange > 0) {
      // Disallow increases beyond allowed; if prevBudget is zero or not set, be conservative
      await testRef.update({
        autopilotActions:
          admin && admin.firestore && admin.firestore.FieldValue
            ? admin.firestore.FieldValue.arrayUnion({
                variantId: winningVariantId,
                confidence: decision.confidence,
                triggeredAt: new Date(),
                reason: "autopilot_rejected_budget_increase",
                attemptedBudgetChangePercent: percentChange,
              })
            : (testData.autopilotActions || []).concat({
                variantId: winningVariantId,
                confidence: decision.confidence,
                triggeredAt: new Date(),
                reason: "autopilot_rejected_budget_increase",
                attemptedBudgetChangePercent: percentChange,
              }),
      });
      return {
        applied: false,
        reason: "budget_increase_disallowed",
        attemptedBudgetChangePercent: percentChange,
      };
    }
    if (Math.abs(percentChange) > maxChange) {
      await testRef.update({
        autopilotActions:
          admin && admin.firestore && admin.firestore.FieldValue
            ? admin.firestore.FieldValue.arrayUnion({
                variantId: winningVariantId,
                confidence: decision.confidence,
                triggeredAt: new Date(),
                reason: "autopilot_rejected_budget_change_exceeds_max",
                attemptedBudgetChangePercent: percentChange,
              })
            : (testData.autopilotActions || []).concat({
                variantId: winningVariantId,
                confidence: decision.confidence,
                triggeredAt: new Date(),
                reason: "autopilot_rejected_budget_change_exceeds_max",
                attemptedBudgetChangePercent: percentChange,
              }),
      });
      return {
        applied: false,
        reason: "budget_change_exceeds_max",
        attemptedBudgetChangePercent: percentChange,
      };
    }

    // Apply winning settings via abTestingService method to ensure consistent state changes
    // If canaryPct specified, create a canary schedule instead of global apply
    const canaryPct = options && typeof options.canaryPct === "number" ? options.canaryPct : null;
    const rampHours = options && typeof options.rampHours === "number" ? options.rampHours : 24;
    let createdSchedule = null;
    if (canaryPct && canaryPct > 0) {
      const promotionService =
        options && options.promotionService
          ? options.promotionService
          : require("../promotionService");
      const scheduleData = this.buildCanaryScheduleData(testData, winningVariant, {
        canaryPct,
        rampHours,
      });
      try {
        createdSchedule = await promotionService.schedulePromotion(
          testData.contentId,
          scheduleData
        );
      } catch (e) {
        console.error("Error scheduling canary promotion:", e.message || e);
        // continue with fallback to standard apply if canary fails
      }
    }
    let winner = null;
    if (!createdSchedule) {
      const abTestingService =
        options && options.abTestingService
          ? options.abTestingService
          : require("../../abTestingService");
      winner = await abTestingService.applyWinningSettings(testData.contentId, winningVariant);
    } else {
      winner = { variantId: winningVariantId, scheduledId: createdSchedule.id };
    }
    // Record winner and status on test
    await testRef.update({
      status: "completed",
      winner: winningVariantId,
      completedDate: new Date(),
    });

    // Log autopilot action with previous settings for rollback
    await testRef.update({
      autopilotActions:
        admin && admin.firestore && admin.firestore.FieldValue
          ? admin.firestore.FieldValue.arrayUnion({
              variantId: winningVariantId,
              confidence: decision.confidence,
              triggeredAt: new Date(),
              reason: createdSchedule ? "autopilot_canary_apply" : "autopilot_auto_apply",
              createdScheduleId: createdSchedule && createdSchedule.id ? createdSchedule.id : null,
              previousPromotionSettings,
            })
          : (testData.autopilotActions || []).concat({
              variantId: winningVariantId,
              confidence: decision.confidence,
              triggeredAt: new Date(),
              reason: createdSchedule ? "autopilot_canary_apply" : "autopilot_auto_apply",
              createdScheduleId: createdSchedule && createdSchedule.id ? createdSchedule.id : null,
              previousPromotionSettings,
            }),
    });
    return { applied: true, winner: winner.variantId, decision };
  }

  async rollbackAuto(testId, actionIndex = -1, options = {}) {
    const { admin, db } = require("../firebaseAdmin");
    const promotionService =
      options && options.promotionService
        ? options.promotionService
        : require("../promotionService");
    const testRef = db.collection("ab_tests").doc(testId);
    const snap = await testRef.get();
    if (!snap.exists) throw new Error("Test not found");
    const testData = snap.data();
    const actions = testData.autopilotActions || [];
    if (!actions.length) throw new Error("No autopilot actions to rollback");
    const action = actionIndex === -1 ? actions[actions.length - 1] : actions[actionIndex];
    if (!action) throw new Error("action not found");

    // Revert test winner if the auto action created one
    if (testData.winner && testData.winner === action.variantId) {
      await testRef.update({ status: "active", winner: null, completedDate: null });
    }

    // If previous promotion settings exist, restore them
    const { previousPromotionSettings } = action || {};
    // If action included a created schedule, delete it
    const { createdScheduleId } = action || {};
    if (createdScheduleId) {
      try {
        await promotionService.deletePromotionSchedule(createdScheduleId);
      } catch (e) {
        console.warn(
          "Failed to delete canary schedule on rollback",
          createdScheduleId,
          e.message || e
        );
      }
    }
    if (previousPromotionSettings && testData.contentId) {
      await db
        .collection("content")
        .doc(testData.contentId)
        .update({ optimizedPromotionSettings: previousPromotionSettings });

      // Update any future promotions to the previous settings
      const futurePromotions = await promotionService.getContentPromotionSchedules(
        testData.contentId
      );
      for (const promotion of futurePromotions) {
        if (new Date(promotion.start_time) > new Date()) {
          await promotionService.updatePromotionSchedule(promotion.id, {
            ...promotion,
            ...previousPromotionSettings,
          });
        }
      }
    }

    // Add rollback action to autopilotActions
    await testRef.update({
      autopilotActions:
        admin && admin.firestore && admin.firestore.FieldValue
          ? admin.firestore.FieldValue.arrayUnion({
              variantId: action.variantId,
              rolledBackAt: new Date(),
              reason: "autopilot_rollback",
              originalAction: action,
            })
          : (testData.autopilotActions || []).concat({
              variantId: action.variantId,
              rolledBackAt: new Date(),
              reason: "autopilot_rollback",
              originalAction: action,
            }),
    });
    return { rolledBack: true, action };
  }
}

module.exports = new AutopilotService();
