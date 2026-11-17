import {
  STORY_BROLL_RULES,
  buildTranscriptGroundedBRollSuggestions,
} from "../storyBeatPlanner";

describe("buildTranscriptGroundedBRollSuggestions", () => {
  it("exports 12 semantic story B-roll domain rules", () => {
    expect(STORY_BROLL_RULES).toHaveLength(12);
    expect(STORY_BROLL_RULES.map(r => r.id)).toEqual([
      "online_discovery",
      "choir_memory",
      "location_memory",
      "culinary_craft",
      "tech_workspace",
      "financial_growth",
      "fitness_athletics",
      "studio_production",
      "urban_journey",
      "product_unboxing",
      "crowd_stage_event",
      "nature_horizon",
    ]);
  });

  it("grounds culinary, tech, finance, fitness, studio, travel, product, event, and nature cues", () => {
    const suggestions = buildTranscriptGroundedBRollSuggestions({
      captionSegments: [
        { id: "c1", start: 1, end: 4, text: "Baking fresh sourdough bread in the kitchen", reviewRequired: false },
        { id: "c2", start: 8, end: 11, text: "Coding software on the laptop monitor", reviewRequired: false },
        { id: "c3", start: 15, end: 18, text: "Revenue growth and profit charts surged", reviewRequired: false },
        { id: "c4", start: 22, end: 25, text: "Training in the gym before the marathon", reviewRequired: false },
        { id: "c5", start: 29, end: 32, text: "Recording in the podcast studio with a microphone", reviewRequired: false },
      ],
      sourceStart: 0,
      sourceEnd: 40,
      maxBeats: 6,
    });

    expect(suggestions.map(s => s.concept)).toEqual([
      "culinary_craft",
      "tech_workspace",
      "financial_growth",
      "fitness_athletics",
      "studio_production",
    ]);
    expect(suggestions[0].style).toBe("detail");
    expect(suggestions[2].style).toBe("proof");
  });

  it("ties phone and choir visuals to exact reviewed spoken lines", () => {
    const suggestions = buildTranscriptGroundedBRollSuggestions({
      captionSegments: [
        {
          id: "phone",
          start: 27.9,
          end: 29.9,
          text: "kuFacebook, bengiscrolla",
          speaker: "guest",
          languages: ["xh", "zu", "en"],
          reviewRequired: false,
        },
        {
          id: "choir",
          start: 30.9,
          end: 35.4,
          text: "Kwi-timeline yakhe, child choir and Brothers and Sisters",
          speaker: "guest",
          reviewRequired: false,
        },
      ],
      sourceStart: 25,
      sourceEnd: 50,
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      concept: "online_discovery",
      time: 3,
      approvalStatus: "proposed",
    });
    expect(suggestions[0].searchQuery).toContain("smartphone");
    expect(suggestions[0].evidenceQuote).toBe("kuFacebook, bengiscrolla");
    expect(suggestions[1].concept).toBe("choir_memory");
    expect(suggestions[1].searchQuery).toContain("choir");
  });

  it("does not invent evenly spaced B-roll without literal transcript evidence", () => {
    expect(
      buildTranscriptGroundedBRollSuggestions({
        captionSegments: [
          { start: 0, end: 3, text: "I think this matters", reviewRequired: false },
        ],
        sourceStart: 0,
        sourceEnd: 20,
      })
    ).toEqual([]);
  });

  it("flags uncertain captions and protects the speaker payoff", () => {
    const suggestions = buildTranscriptGroundedBRollSuggestions({
      captionSegments: [
        {
          id: "uncertain",
          start: 2,
          end: 4,
          text: "I saw it on Facebook",
          reviewRequired: true,
        },
        {
          id: "payoff",
          start: 8,
          end: 10,
          text: "No man, angivuke ngiyocula. I can do this",
          reviewRequired: false,
        },
      ],
      sourceStart: 0,
      sourceEnd: 12,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].approvalStatus).toBe("blocked_by_transcript_review");
    expect(suggestions.some(item => item.captionSegmentId === "payoff")).toBe(false);
  });
});
