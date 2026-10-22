#!/usr/bin/env node
// Editorial packaging for the first four authored stories. Never submits media.
const fs = require("node:fs"),
  path = require("node:path");
const c = require("./contract"),
  root = path.resolve(__dirname, "../.."),
  date = "2026-10-17";
const directory = c.dayRoot(root, date),
  bookFile = path.join(directory, "day.json");
const book = JSON.parse(fs.readFileSync(bookFile));
if (book.posts.some(p => p.contentId || p.queueVerified))
  throw Error("Preserve existing acknowledgements; reconcile before changing packages");
const stories = {
  "pacing-contrast": {
    youtube: [
      "Video pacing: use contrast between fast motion and held type",
      "A fast sequence needs a readable place to land. This short type study contrasts rushing echoes with a held final message. The complete result stays above its actual editable layers.",
      "Which beat would you hold longer?",
    ],
    tiktok: [
      "Can a slower moment make an edit feel stronger?",
      "The busy part gets your attention. The pause gives the words somewhere to land. Watch both choices with the real layers visible.",
      "Does the held ending work for you?",
    ],
    instagram: [
      "Kinetic type needs breathing room",
      "Echoes build pressure; a clean poster gives it a payoff. A type-and-rhythm study with the actual composition underneath.\n\n#KineticTypography #MotionDesign #EditingRhythm",
      "Save the contrast idea for your next type edit.",
    ],
    linkedin: [
      "Give pacing feedback a specific revision target",
      "“Make it punchier” leaves a team guessing. Here the contrast between a busy section and a held message is visible beside the editable layers, making the timing decision easier to discuss.",
      "Which pacing note is hardest to turn into an edit?",
    ],
    facebook: [
      "Ever made an edit faster and still felt it was missing something?",
      "Sometimes the message needs a quieter beat. This short example shows busy movement followed by a clear held ending, with the actual editing layers underneath.",
      "Would you shorten the ending or let it breathe?",
    ],
    reddit: [
      "Pacing feedback: does this held type ending earn its pause?",
      "I am sharing my own editing-tool development demo. I contrast quick repeated words with a much calmer final message. The complete result and real editable layers are visible together. I want feedback on the balance between the rush and the hold.",
      "At what point would you change the pacing?",
    ],
  },
  "editable-reveal": {
    youtube: [
      "Editable split-text reveal using three masked title layers",
      "A split word can stay editable. This example uses three independently masked text bands and their motion keys; the actual layer rows are visible beside the complete result.",
      "Which band would you retime?",
    ],
    tiktok: [
      "The text splits. What happens when you need to change the word?",
      "These pieces are still title layers, each with its own mask and motion. You can see the actual bands underneath the finished effect.",
      "Would you keep the split or resolve it sooner?",
    ],
    instagram: [
      "Three masks, one readable type reveal",
      "Offset bands, small alignment marks and a clean resolve. The text stays editable through the existing layer controls.\n\n#TypeAnimation #MaskedTypography #MotionDesign",
      "Save the editable-band approach.",
    ],
    linkedin: [
      "Keep a text reveal revisable after the first export",
      "A typography effect becomes easier to revise when its text, masks and timing remain separate decisions. This example keeps three native title bands editable and shows the result alongside those layers.",
      "Which late text revision usually creates the most rework?",
    ],
    facebook: [
      "Made a text effect, then needed to change the wording?",
      "This word splits into three moving bands while the underlying titles stay editable. The finished effect and its real layers are visible together.",
      "Which part would you change first?",
    ],
    reddit: [
      "Split-type feedback: do these three bands resolve clearly enough?",
      "This is my own editing-tool development demo. The word uses three separately masked title layers, with the real editing tracks shown underneath. I am looking for feedback on displacement and reading time, rather than a general app review.",
      "Which band or transition would you adjust?",
    ],
  },
  "visual-hierarchy": {
    youtube: [
      "Motion typography hierarchy: reduce competing text to one focal point",
      "When every word moves at once, the viewer needs a clear place to look. This composition contrasts a grid of competing titles with one dominant word and more negative space.",
      "Does the final focal point read quickly enough?",
    ],
    tiktok: [
      "If everything is trying to get attention, where do you look?",
      "A busy grid turns into one clear message. The real layers stay visible so you can see what is removed and what takes over.",
      "Which version gets your attention faster?",
    ],
    instagram: [
      "Less competing motion. A clearer focal point.",
      "An echo grid contracts into negative space and one dominant word. A hierarchy study with the complete composition and editable layers visible.\n\n#VisualHierarchy #KineticType #MotionDesign",
      "Save the negative-space reminder.",
    ],
    linkedin: [
      "Make the main message clear before adding more motion",
      "Reviewing a promotional edit is easier when the team agrees on the focal point. This composition makes that decision visible: competing titles give way to one dominant message.",
      "How do you decide what the viewer should read first?",
    ],
    facebook: [
      "Ever added more text and made your video harder to follow?",
      "This example starts with competing words and strips them back to one focal point. The complete result appears with the real layers that create it.",
      "Does removing the extra movement help?",
    ],
    reddit: [
      "Typography hierarchy feedback: does the busy grid make the resolve stronger?",
      "I am sharing a type study made in my own editing-tool development build. A grid competes for attention before a single word takes over. The finished result and actual layers are visible together.",
      "Is the contrast useful, or does the grid stay too long?",
    ],
  },
  "sound-alignment": {
    youtube: [
      "Sync type and visual impacts with separate sound accents",
      "A cut, a title and a sound accent can target the same moment. This short composition shows timed impact bars and words beside the real editable layers, with an original score.",
      "Which impact would you retime?",
    ],
    tiktok: [
      "Why does one tiny timing change make an impact feel different?",
      "The bars, words and sound accents have their own timing. This is a short study of making those separate decisions land together.",
      "Which hit feels the most connected?",
    ],
    instagram: [
      "Type hits meet deliberate sound accents",
      "Stepped impact bars, CUT / TYPE / SOUND and a shared resolve. Original sound, with the actual visual layers visible underneath.\n\n#SoundDesign #TypeAnimation #MotionRhythm",
      "Save the visual-and-sound timing idea.",
    ],
    linkedin: [
      "Separate the visual revision from the sound revision",
      "When an impact feels wrong, the change may belong to the picture, the title or the sound accent. This short demo keeps those decisions traceable through actual editable layers and a separate score.",
      "Which timing decision is hardest to communicate during review?",
    ],
    facebook: [
      "The words move and the music plays. Why does it still feel off?",
      "They may need to land on the same moment. This short example uses separate visual and sound accents, while the complete result stays visible above its real layers.",
      "Which moment would you move?",
    ],
    reddit: [
      "Sound-and-type timing feedback: which accent needs moving?",
      "This is my own editing-tool development demo with original sound. The type, bars and score are separate editable decisions; the full result and real layers are shown together.",
      "Which specific hit would you retime, and in which direction?",
    ],
  },
};
const audiences = {
  youtube: "Editors searching for a specific editing technique",
  tiktok: "Short-form creators troubleshooting a flat edit",
  instagram: "Motion designers and reel editors studying type and rhythm",
  linkedin: "Content teams discussing concrete revision decisions",
  facebook: "Creators making their short edits clearer",
  reddit: "Editors discussing specific craft and timing choices",
};
const disclosures = {
  youtube:
    "Original typography and sound, edited in a development build of AutoPromote. The actual editable layers are shown.",
  tiktok: "Original type + sound. Actual editable layers shown. Editing-tool development demo.",
  instagram: "Original typography and score. An editable layer study in our development build.",
  linkedin: "Original typography and score, created in our development version of AutoPromote.",
  facebook: "Original words and sound, edited in our development version of AutoPromote.",
  reddit: "The typography and sound are original.",
};
const posts = [];
for (const [index, story] of book.stories.entries()) {
  c.validateStory(root, story);
  for (const platform of c.policy.platforms) {
    const [title, body, cta] = stories[story.id][platform],
      localTime = `${date}T${c.policy.slots[platform][index]}`;
    posts.push({
      postId: `${story.id}.${platform}`,
      storyId: story.id,
      platform,
      platforms: [platform],
      audience: audiences[platform],
      problem: story.problem,
      hook: story.visualHook,
      payoff: story.payoff,
      title,
      description: `${body}\n\n${cta}\n\n${disclosures[platform]}`,
      cta,
      media: story.recording,
      mediaSha256: story.recordingSha256,
      visualReviewed: true,
      allowCropOfVideoOrTimeline: false,
      format: {
        preserveFullVideo: true,
        preserveMatchingTimeline: true,
        allowCropOfVideoOrTimeline: false,
        currentRecordingAspect: "16:10",
      },
      timezone: c.policy.timezone,
      localTime,
      scheduledAt: new Date(`${localTime}:00+02:00`).toISOString(),
      status: "PREPARED_NOT_SCHEDULED",
      queueVerified: false,
    });
  }
}
book.posts = posts;
c.atomic(bookFile, book);
c.validateDay(root, book);
c.atomic(path.join(directory, "platform-packages.json"), {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  timezone: c.policy.timezone,
  intent: { platforms: c.policy.platforms, postsPerPlatformPerDay: 4 },
  posts,
});
console.log(JSON.stringify({ reviewedStories: 4, platformPackages: posts.length, scheduled: 0 }));
