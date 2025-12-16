const { admin, db } = require("./firebaseAdmin");
const { calculateConfidenceForVariants } = require("./src/utils/statistics");
const promotionService = require("./promotionService");

class ABTestingService {
  async createTest(contentId, variants) {
    try {
      const testData = {
        contentId,
        variants: variants.map(variant => ({
          ...variant,
          metrics: {
            views: 0,
            engagement: 0,
            conversions: 0,
            revenue: 0,
          },
        })),
        startDate: new Date(),
        status: "active",
        winner: null,
        autopilot: {
          enabled: false,
          confidenceThreshold: 95,
          minSample: 100,
          maxBudgetChangePercent: 10,
          allowBudgetIncrease: false,
          mode: "recommend", // 'recommend' | 'auto'
          requiresApproval: false,
          approvedBy: null,
          approvedAt: null,
        },
      };

      // Create test document
      const testRef = await db.collection("ab_tests").add(testData);

      // Schedule promotions for each variant
      for (const variant of variants) {
        await promotionService.schedulePromotion(contentId, {
          ...variant.promotionSettings,
          ab_test_id: testRef.id,
          variant_id: variant.id,
        });
      }

      return {
        testId: testRef.id,
        ...testData,
      };
    } catch (error) {
      console.error("Error creating A/B test:", error);
      throw error;
    }
  }

  async updateTestMetrics(testId, variantId, metrics) {
    try {
      const testRef = db.collection("ab_tests").doc(testId);
      const test = await testRef.get();

      if (!test.exists) {
        throw new Error("Test not found");
      }

      const testData = test.data();
      const variantIndex = testData.variants.findIndex(v => v.id === variantId);

      if (variantIndex === -1) {
        throw new Error("Variant not found");
      }

      // Update metrics
      testData.variants[variantIndex].metrics = {
        ...testData.variants[variantIndex].metrics,
        ...metrics,
      };

      // Update test document
      await testRef.update({
        variants: testData.variants,
      });

      // Check if we should determine a winner
      if (this.shouldDetermineWinner(testData)) {
        await this.determineWinner(testId);
      }

      // If autopilot is enabled, evaluate whether to auto-apply a winner
      try {
        await this.maybeAutoApply(testId, testData);
      } catch (err) {
        console.warn("[ABTesting] autopilot evaluation error", err.message);
      }

      return testData;
    } catch (error) {
      console.error("Error updating test metrics:", error);
      throw error;
    }
  }

  async determineWinner(testId) {
    try {
      const testRef = db.collection("ab_tests").doc(testId);
      const test = await testRef.get();
      const testData = test.data();

      // Calculate scores for each variant
      const variantScores = testData.variants.map(variant => ({
        variantId: variant.id,
        score: this.calculateVariantScore(variant.metrics),
      }));

      // Find winner
      const winner = variantScores.reduce((prev, current) =>
        current.score > prev.score ? current : prev
      );

      // Update test with winner
      await testRef.update({
        status: "completed",
        winner: winner.variantId,
        completedDate: new Date(),
      });

      // Apply winning settings to future promotions
      await this.applyWinningSettings(
        testData.contentId,
        testData.variants.find(v => v.id === winner.variantId)
      );

      return winner;
    } catch (error) {
      console.error("Error determining winner:", error);
      throw error;
    }
  }

  calculateVariantScore(metrics) {
    // Implement your scoring algorithm here
    return (
      metrics.views * 0.3 +
      metrics.engagement * 0.3 +
      metrics.conversions * 0.2 +
      metrics.revenue * 0.2
    );
  }

  shouldDetermineWinner(testData) {
    // Check if test has run long enough and has sufficient data
    const minDuration = 7 * 24 * 60 * 60 * 1000; // 7 days
    const minViews = 1000;

    const startDate =
      testData.startDate && testData.startDate.toDate
        ? testData.startDate.toDate()
        : new Date(testData.startDate);
    const testDuration = Date.now() - startDate;
    const totalViews = testData.variants.reduce((sum, variant) => sum + variant.metrics.views, 0);

    return testDuration >= minDuration && totalViews >= minViews;
  }

  async applyWinningSettings(contentId, winningVariant) {
    try {
      // Update promotion settings for the content
      await db.collection("content").doc(contentId).update({
        optimizedPromotionSettings: winningVariant.promotionSettings,
      });

      // Update any future scheduled promotions
      const futurePromotions = await promotionService.getContentPromotionSchedules(contentId);

      for (const promotion of futurePromotions) {
        if (new Date(promotion.start_time) > new Date()) {
          await promotionService.updatePromotionSchedule(promotion.id, {
            ...promotion,
            ...winningVariant.promotionSettings,
          });
        }
      }
    } catch (error) {
      console.error("Error applying winning settings:", error);
      throw error;
    }
  }

  async getTestResults(testId) {
    try {
      const test = await db.collection("ab_tests").doc(testId).get();

      if (!test.exists) {
        throw new Error("Test not found");
      }

      const testData = test.data();

      // Calculate additional insights
      const insights = this.generateInsights(testData);

      return {
        ...testData,
        insights,
      };
    } catch (error) {
      console.error("Error getting test results:", error);
      throw error;
    }
  }

  generateInsights(testData) {
    const insights = {
      confidenceLevel: this.calculateConfidenceLevel(testData),
      improvements: {
        views: 0,
        engagement: 0,
        conversions: 0,
        revenue: 0,
      },
      recommendations: [],
    };

    if (testData.winner) {
      const winningVariant = testData.variants.find(v => v.id === testData.winner);
      const otherVariants = testData.variants.filter(v => v.id !== testData.winner);

      // Calculate improvements
      const baselineMetrics = otherVariants.reduce(
        (acc, variant) => ({
          views: acc.views + variant.metrics.views,
          engagement: acc.engagement + variant.metrics.engagement,
          conversions: acc.conversions + variant.metrics.conversions,
          revenue: acc.revenue + variant.metrics.revenue,
        }),
        { views: 0, engagement: 0, conversions: 0, revenue: 0 }
      );

      for (const [metric, value] of Object.entries(baselineMetrics)) {
        const baseline = value / otherVariants.length;
        const improvement = ((winningVariant.metrics[metric] - baseline) / baseline) * 100;
        insights.improvements[metric] = Math.round(improvement * 100) / 100;
      }

      // Generate recommendations
      insights.recommendations = this.generateTestRecommendations(testData);
    }

    return insights;
  }

  calculateConfidenceLevel(testData) {
    try {
      if (!testData || !testData.variants) return 0;
      return calculateConfidenceForVariants(testData.variants);
    } catch (err) {
      console.warn("[ABTesting] calculateConfidenceLevel error", err.message);
      return 0;
    }
  }

  // Statistical helpers moved into src/utils/statistics.js

  async maybeAutoApply(testId, testData) {
    try {
      if (!testData || !testData.autopilot || !testData.autopilot.enabled) return;
      const minSample = testData.autopilot.minSample || 100;
      const threshold =
        typeof testData.autopilot.confidenceThreshold === "number"
          ? testData.autopilot.confidenceThreshold
          : 95;

      // require min total views to proceed
      const totalViews = testData.variants.reduce((sum, v) => sum + (v.metrics.views || 0), 0);
      if (totalViews < minSample) return;

      // Compute candidate winner by score
      const variantScores = testData.variants.map(variant => ({
        variantId: variant.id,
        score: this.calculateVariantScore(variant.metrics || {}),
      }));
      const winner = variantScores.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));

      // Calculate confidence for the test as whole
      const confidence = this.calculateConfidenceLevel(testData);
      if (confidence >= threshold) {
        // Make sure we haven't already got a winner
        if (!testData.winner) {
          // If autopilot is configured in recommend-only mode, simply log the recommendation
          if (testData.autopilot && testData.autopilot.mode !== "auto") {
            // write a recommendation record, but do not apply
            const testRef2 = db.collection("ab_tests").doc(testId);
            await testRef2.update({
              autopilotRecommendations:
                admin && admin.firestore && admin.firestore.FieldValue
                  ? admin.firestore.FieldValue.arrayUnion({
                      variantId: winner.variantId,
                      confidence,
                      triggeredAt: new Date(),
                      reason: "autopilot_recommendation",
                    })
                  : (testData.autopilotRecommendations || []).concat({
                      variantId: winner.variantId,
                      confidence,
                      triggeredAt: new Date(),
                      reason: "autopilot_recommendation",
                    }),
            });
            return;
          }
          // Use autopilotService to apply auto with safety checks (budget limits, etc.)
          try {
            const autopilotService = require("./src/services/autopilotService");
            const applyResult = await autopilotService.applyAuto(testId);
            // log autopilot action (applyResult will be logged by autopilotService.applyAuto as well)
            const testRef = db.collection("ab_tests").doc(testId);
            await testRef.update({
              autopilotActions:
                admin && admin.firestore && admin.firestore.FieldValue
                  ? admin.firestore.FieldValue.arrayUnion({
                      variantId: winner.variantId,
                      confidence,
                      triggeredAt: new Date(),
                      reason: applyResult.applied
                        ? "autopilot_auto_apply"
                        : applyResult.reason || "autopilot_auto_apply_failed",
                    })
                  : (testData.autopilotActions || []).concat({
                      variantId: winner.variantId,
                      confidence,
                      triggeredAt: new Date(),
                      reason: applyResult.applied
                        ? "autopilot_auto_apply"
                        : applyResult.reason || "autopilot_auto_apply_failed",
                    }),
            });
          } catch (e) {
            console.warn("[ABTesting] autopilot apply failed inside maybeAutoApply", e.message);
          }
        }
      }
    } catch (err) {
      console.warn("[ABTesting] maybeAutoApply error", err.message);
    }
  }

  generateTestRecommendations(testData) {
    const recommendations = [];
    const winningVariant = testData.variants.find(v => v.id === testData.winner);

    if (winningVariant) {
      // Analyze what made the winning variant successful
      if (winningVariant.promotionSettings.platform) {
        recommendations.push({
          type: "platform",
          message: `Focus promotion efforts on ${winningVariant.promotionSettings.platform}`,
        });
      }

      if (winningVariant.promotionSettings.target_audience) {
        recommendations.push({
          type: "audience",
          message: "Target similar demographic profiles for future promotions",
        });
      }

      // Add more recommendation logic
    }

    return recommendations;
  }
}

module.exports = new ABTestingService();
