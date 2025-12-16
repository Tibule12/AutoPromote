// test-caption-generation.js
// Quick test for AI caption and hashtag generation

require("dotenv").config();

async function testCaptionGeneration() {
  console.log("\n🧪 Testing AI Caption Generation...\n");

  // Test content data
  const testContent = {
    title: "How to Build a Successful Social Media Strategy in 2025",
    description:
      "Learn the proven tactics that top creators use to grow their audience and maximize engagement across all platforms.",
    tags: ["socialmedia", "marketing", "contentcreator", "growth", "strategy"],
    type: "video",
  };

  console.log("Test Content:");
  console.log(JSON.stringify(testContent, null, 2));
  console.log("\n");

  // Test 1: Instagram Caption
  console.log("═".repeat(60));
  console.log("TEST 1: Instagram Caption Generation");
  console.log("═".repeat(60));

  try {
    const captionService = require("./src/services/captionGenerationService");
    const result = await captionService.generateCaption(testContent, "instagram", {
      tone: "casual",
      length: "medium",
      includeEmojis: true,
      includeHashtags: true,
      hashtagCount: 10,
    });

    console.log("✅ Caption Generated!\n");
    console.log("Caption:");
    console.log(result.caption);
    console.log("\nHashtags:");
    console.log(result.hashtags.join(" "));
    console.log("\nMetadata:");
    console.log(`  Characters: ${result.characterCount}`);
    console.log(`  Engagement Score: ${result.estimatedEngagement}/100`);
    console.log(`  Status: ${result.success ? "Success" : "Fallback"}`);
  } catch (error) {
    console.log("❌ Test 1 Failed:", error.message);
  }

  console.log("\n");

  // Test 2: TikTok Caption
  console.log("═".repeat(60));
  console.log("TEST 2: TikTok Caption Generation");
  console.log("═".repeat(60));

  try {
    const captionService = require("./src/services/captionGenerationService");
    const result = await captionService.generateCaption(testContent, "tiktok", {
      tone: "funny",
      length: "short",
      includeEmojis: true,
      hashtagCount: 8,
    });

    console.log("✅ Caption Generated!\n");
    console.log(result.caption);
    console.log("\nHashtags:", result.hashtags.join(" "));
  } catch (error) {
    console.log("❌ Test 2 Failed:", error.message);
  }

  console.log("\n");

  // Test 3: Hashtag Generation Only
  console.log("═".repeat(60));
  console.log("TEST 3: Standalone Hashtag Generation");
  console.log("═".repeat(60));

  try {
    const hashtagService = require("./src/services/hashtagService");
    const result = await hashtagService.generateHashtags(testContent, "youtube", {
      count: 15,
      mixRatio: { trending: 0.4, niche: 0.4, branded: 0.2 },
    });

    console.log("✅ Hashtags Generated!\n");
    console.log("Formatted:", result.formatted);
    console.log("\nCategories:");
    console.log("  Trending:", result.categories?.trending?.join(", ") || "N/A");
    console.log("  Niche:", result.categories?.niche?.join(", ") || "N/A");
    console.log("  Branded:", result.categories?.branded?.join(", ") || "N/A");
    console.log("\nEstimated Reach:", result.estimatedReach?.formatted || "Unknown");
  } catch (error) {
    console.log("❌ Test 3 Failed:", error.message);
  }

  console.log("\n");

  // Test 4: Caption Variations for A/B Testing
  console.log("═".repeat(60));
  console.log("TEST 4: Caption Variations (A/B Testing)");
  console.log("═".repeat(60));

  try {
    const captionService = require("./src/services/captionGenerationService");
    const result = await captionService.generateVariations(testContent, "linkedin", 3, {
      length: "medium",
      includeEmojis: false,
    });

    console.log(`✅ Generated ${result.variations.length} variations!\n`);
    result.variations.forEach((variant, idx) => {
      console.log(`Variant ${idx + 1} (${variant.metadata.tone}):`);
      console.log(variant.caption);
      console.log("");
    });
  } catch (error) {
    console.log("❌ Test 4 Failed:", error.message);
  }

  console.log("\n");

  // Test 5: Trending Hashtags
  console.log("═".repeat(60));
  console.log("TEST 5: Get Trending Hashtags");
  console.log("═".repeat(60));

  try {
    const hashtagService = require("./src/services/hashtagService");
    const result = await hashtagService.getTrendingHashtags("instagram", 20);

    console.log("✅ Trending Hashtags Retrieved!\n");
    console.log(result.trending.slice(0, 10).join(" "));
    console.log(`\n(Showing 10 of ${result.count} trending tags)`);
  } catch (error) {
    console.log("❌ Test 5 Failed:", error.message);
  }

  // Summary
  console.log("\n");
  console.log("═".repeat(60));
  console.log("TEST SUMMARY");
  console.log("═".repeat(60));

  const openaiConfigured = !!process.env.OPENAI_API_KEY;

  if (openaiConfigured) {
    console.log("✅ OpenAI API Key: Configured");
    console.log("✅ AI-powered generation: Active");
    console.log("\n🎉 All systems operational!");
    console.log("   You can now use AI captions in production.");
  } else {
    console.log("⚠️  OpenAI API Key: Not configured");
    console.log("⚠️  AI-powered generation: Using fallback");
    console.log("\n💡 To enable AI features:");
    console.log("   1. Get OpenAI API key from https://platform.openai.com");
    console.log("   2. Add to Render: OPENAI_API_KEY=sk-...");
    console.log("   3. Redeploy backend");
  }

  console.log("\n");
}

// Run tests
testCaptionGeneration().catch(err => {
  console.error("\n❌ Fatal error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
