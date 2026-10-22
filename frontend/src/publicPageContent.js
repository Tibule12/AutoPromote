// Public explanations of the current workflow. Prices and entitlements stay in
// the existing live plan cards; these pages do not invent a second plan table.
export const publicPages = {
  features: {
    eyebrow: "PRODUCT / CREATE → RELEASE → LEARN",
    title: "Make the edit. Own the release.",
    intro:
      "Turn your footage into a finished story, give each platform its own version, and keep the next release moving from one workspace.",
    cards: [
      {
        title: "An edit you can keep editing",
        copy: "Trim footage, arrange video and graphics, adjust sound, and work with layers and keyframes in Studio. Save the project, return to its timeline, and export the result.",
        to: "/docs/studio",
        link: "Explore Studio",
      },
      {
        title: "Words and logos with movement",
        copy: "Build titles and logo artwork, animate individual pieces and shape their timing. Motion, Graphics and the timeline work on the same editable project.",
        to: "/docs/motion",
        link: "See motion controls",
      },
      {
        title: "Sound that belongs to the picture",
        copy: "Place music and effects on the programme clock. Adjust cue timing, levels and fades, then check the complete export with sound.",
        to: "/docs/audio",
        link: "Shape the sound",
      },
      {
        title: "A post for each destination",
        copy: "Choose connected platforms in Publisher and adapt each title, caption, media and audience setting. A LinkedIn post and a TikTok video can have different copy and release times.",
        to: "/integrations",
        link: "See the destinations",
      },
      {
        title: "A schedule you can inspect",
        copy: "Choose the date, time and timezone for each destination. See the queue and release calendar, inspect individual posts, and change upcoming releases through the available controls.",
        to: "/docs/publishing",
        link: "Plan a release",
      },
      {
        title: "Feedback you can work with",
        copy: "Follow publication status and the performance numbers returned by each connected platform. Use the available evidence to decide what to try next.",
        to: "/metrics",
        link: "Understand the numbers",
      },
    ],
    sections: [
      {
        title: "Choose the tools that fit your work.",
        copy: "Editing access, connected accounts, uploads, distribution and compute credits depend on your plan. Check the current plan cards and the cost shown before starting a processing job.",
        to: "/pricing",
        link: "Compare plans",
      },
    ],
  },
  integrations: {
    eyebrow: "DESTINATIONS / SIX DIFFERENT CONVERSATIONS",
    title: "One workspace. Each platform’s own post.",
    intro:
      "Create for the people on the other side of the screen. Connect your accounts, adapt the post, then choose when each destination gets its version.",
    cards: [
      {
        platform: "youtube",
        title: "YouTube",
        copy: "Give your video a clear title and description, choose the available upload options, and schedule the channel release.",
        to: "/docs/publishing",
        link: "Plan your upload",
      },
      {
        platform: "tiktok",
        title: "TikTok",
        copy: "Prepare a vertical edit, write the caption for its audience, and review the creator, privacy and consent options shown before publishing.",
        to: "/docs/publishing",
        link: "Prepare the post",
      },
      {
        platform: "instagram",
        title: "Instagram",
        copy: "Package the visual result for your connected account, review the supported media format and give the caption its own voice.",
        to: "/docs/publishing",
        link: "Prepare the post",
      },
      {
        platform: "facebook",
        title: "Facebook",
        copy: "Choose the connected destination, pair the video with a useful introduction, and give the post its own release time.",
        to: "/docs/publishing",
        link: "Plan the release",
      },
      {
        platform: "linkedin",
        title: "LinkedIn",
        copy: "Explain the useful result, workflow or lesson behind the video. Inspect the connected identity and the available publishing options.",
        to: "/docs/publishing",
        link: "Prepare the post",
      },
      {
        platform: "reddit",
        title: "Reddit",
        copy: "Choose an eligible community or profile destination and check its posting rules. Review the title, media and publication state after submission.",
        to: "/docs/publishing",
        link: "Review the workflow",
      },
    ],
    sections: [
      {
        title: "Check the connection before the countdown.",
        copy: "Integration depth varies by platform and account. Connections and Publisher show the options available to your account; permissions, token expiry and provider processing can affect a release. Other integrations are available only where your workspace exposes them. A submitted upload is separate from a confirmed published post.",
        to: "/help",
        link: "Connection and publishing help",
      },
    ],
  },
  metrics: {
    eyebrow: "ANALYTICS / LEARN FROM THE RELEASE",
    title: "See what happened after Publish.",
    intro:
      "Put publication state and available platform performance together, so your next creative decision has something real behind it.",
    cards: [
      {
        title: "Start with the actual post",
        copy: "Inspect the release and its destinations. A scheduled post, an upload being processed and a published video represent different stages of the journey.",
        to: "/docs/publishing",
        link: "Understand post states",
      },
      {
        title: "Keep the numbers meaningful",
        copy: "Views, impressions, reactions and other metrics mean different things across platforms. A measured zero stays zero; a number the provider has not returned is unavailable.",
        to: "/help",
        link: "Get analytics help",
      },
      {
        title: "Compare, then make the next edit",
        copy: "Look at the available results for each destination and allow for reporting delays. Use those observations to revise the opening, pacing or packaging of your next video.",
        to: "/docs/studio",
        link: "Return to the edit",
      },
    ],
    sections: [
      {
        title: "Know what the dashboard can tell you.",
        copy: "Metric availability and refresh timing depend on the platform, permissions and your plan. The dashboard does not guarantee reach, revenue attribution or audience growth. Check the source and reporting period before comparing posts.",
      },
    ],
  },
  about: {
    eyebrow: "ABOUT / MORE TIME FOR THE WORK",
    title: "Publishing should leave room for creating.",
    intro:
      "A strong edit is only part of the job. Creators also have to prepare each post, move between accounts, remember release times and make sense of the response.",
    cards: [
      {
        title: "Make the work yours",
        copy: "Studio brings footage, sound, typography and motion into an editable timeline. Keep control of the decisions that make the story feel like you.",
        to: "/features",
        link: "Meet the tools",
      },
      {
        title: "Give it a thoughtful release",
        copy: "Publisher and the schedule connect the finished media to individual destinations, with each platform’s copy and timing visible.",
        to: "/integrations",
        link: "See the publishing flow",
      },
      {
        title: "Learn from what happened",
        copy: "Publication records and available analytics help you follow the release. They are evidence to work with, rather than a promise that an algorithm will reward every post.",
        to: "/metrics",
        link: "Understand the feedback",
      },
    ],
    sections: [
      {
        title: "Built around the complete creator workflow.",
        copy: "AutoPromote brings making, publishing and reviewing into one place. The aim is practical: spend less of your day repeating the same publishing steps, and more of it making work people want to watch.",
        to: "/contact",
        link: "Tell us what you’re making",
      },
    ],
  },
  contact: {
    eyebrow: "CONTACT / START A CONVERSATION",
    title: "Tell us what you’re working on.",
    intro:
      "A product question, a blocked release or an idea for working together? Give us the context and we’ll have a clearer place to start.",
    cards: [
      {
        title: "Product and account help",
        copy: "Include the page involved, what you expected, what happened and the approximate time. For a publishing issue, include the destination and post or task reference if available.",
        email: "AutoPromote support",
        action: "Email support",
      },
      {
        title: "Plans and collaboration",
        copy: "Tell us about your content, the destinations you use and the workflow you want to improve. For collaboration, include a useful example or portfolio.",
        email: "AutoPromote collaboration",
        action: "Start a conversation",
      },
      {
        title: "Privacy and security",
        copy: "Use this contact for privacy requests or a private security report. Share the affected page and a description; keep passwords, access tokens and payment details out of your message.",
        email: "AutoPromote privacy or security",
        action: "Send a private inquiry",
      },
    ],
    sections: [
      {
        title: "One direct contact.",
        copy: "You can reach AutoPromote at thulani@autopromote.org. Signed-in users can also check their plan’s support options and existing tickets.",
        to: "/support",
        link: "Open support",
      },
    ],
  },
  careers: {
    eyebrow: "CAREERS / BUILD WITH CREATORS",
    title: "Care about the details behind a great tool?",
    intro:
      "Thoughtful editing tools, dependable publishing and clear product design take people who care about how the whole workflow feels.",
    cards: [
      {
        title: "Product and design",
        copy: "Show us how you make complicated workflows understandable. Creator tools, accessible interfaces and useful interaction details are good starting points.",
      },
      {
        title: "Editing and engineering",
        copy: "Share work on media, timelines, motion, audio or reliable web applications. Explain the decisions you made and what you learned.",
      },
      {
        title: "Start with your work",
        copy: "For an expression of interest, send a portfolio or a concise introduction. Any specific role, working arrangement and application process will be confirmed directly.",
        email: "Working with AutoPromote",
        action: "Introduce yourself",
      },
    ],
  },
  partners: {
    eyebrow: "COLLABORATION / MAKE SOMETHING USEFUL",
    title: "Bring a workflow worth building together.",
    intro:
      "We’re interested in the ways creators, educators and teams can make editing and publishing easier to understand and use.",
    cards: [
      {
        title: "Creators and educators",
        copy: "Have a practical tutorial, a demonstration or a story about making better content? Tell us the audience, the idea and what viewers will learn.",
        email: "Creator collaboration",
        action: "Share your idea",
      },
      {
        title: "Teams and communities",
        copy: "Show us where your team loses time between editing and publication. A concrete workflow gives us a useful conversation to start with.",
        email: "Team collaboration",
        action: "Discuss your workflow",
      },
      {
        title: "Technology and integration",
        copy: "Describe the systems you want to connect and the result you need. Integration access, scope and any commercial terms need to be agreed directly.",
        email: "Integration collaboration",
        action: "Discuss an integration",
      },
    ],
    sections: [
      {
        title: "Clear arrangements, agreed directly.",
        copy: "Platform integrations do not imply endorsement or a formal partnership with those platforms. Referral payments, affiliate terms or partnership benefits are only available when agreed explicitly.",
      },
    ],
  },
  api: {
    eyebrow: "DEVELOPERS / CONNECT YOUR WORKFLOW",
    title: "Have something you want to connect?",
    intro:
      "Tell us what your application needs to do before building against an endpoint. Authentication, supported operations and access should be confirmed for your integration.",
    cards: [
      {
        title: "Describe the outcome",
        copy: "Share the systems involved, what should move between them, who authorizes access and the expected volume.",
        email: "AutoPromote API integration",
        action: "Discuss API access",
      },
      {
        title: "Use the supported product flow",
        copy: "The web app uses authenticated services for media, projects and publishing. Internal app endpoints are not a promise of a stable public API or a self-service API-key programme.",
        to: "/docs",
        link: "Read the product guides",
      },
      {
        title: "Keep account access private",
        copy: "Do not share a browser session or copy account tokens into a third-party tool. Agree the supported authentication and permissions for the integration first.",
        to: "/security",
        link: "Review account security",
      },
    ],
  },
  security: {
    eyebrow: "TRUST / PROTECT THE WORK",
    title: "Keep control of your account and content.",
    intro:
      "Practical account security starts with the people and platforms you authorize, and with the way you share your work.",
    cards: [
      {
        title: "Account access",
        copy: "AutoPromote uses Firebase Authentication for sign-in. Use a strong account password, protect your connected sign-in provider and review the security options available in your dashboard.",
      },
      {
        title: "Connected destinations",
        copy: "Review the identity and permissions shown when connecting a social account. Disconnect access you no longer need and reconnect through the normal flow when a connection expires.",
        to: "/docs/publishing",
        link: "Manage publishing access",
      },
      {
        title: "Report an issue privately",
        copy: "Send the affected URL, expected behaviour and steps that demonstrate the issue. Keep other people’s data, passwords and live access tokens out of the report.",
        email: "Private security report",
        action: "Report a security issue",
      },
    ],
    sections: [
      {
        title: "Clear information about your data.",
        copy: "The Privacy Policy describes the information handled by the service. This page does not claim an independent security certification, a completed audit or a paid bug-bounty programme.",
        to: "/privacy",
        link: "Read the privacy policy",
      },
    ],
  },
  accessibility: {
    eyebrow: "ACCESSIBILITY / MAKE THE WORKFLOW CLEARER",
    title: "Good tools should be easier to use.",
    intro:
      "Readable controls, clear focus and useful alternatives matter. We want to hear when an interaction gets in your way.",
    cards: [
      {
        title: "Reading and navigation",
        copy: "These pages provide headings, keyboard focus indicators and a skip-to-content link. Browser zoom and responsive layouts help keep the text readable.",
      },
      {
        title: "Motion and media",
        copy: "The welcome page offers manual playback and reduced-motion behaviour. Studio is a desktop editing workspace; some visual editing tasks require a precise pointer and a larger screen.",
        to: "/docs/studio",
        link: "See the Studio workflow",
      },
      {
        title: "Tell us about a barrier",
        copy: "Include the page, task, browser and any assistive technology involved. Describe what stopped you from completing the task and the alternative that would help.",
        email: "Accessibility feedback",
        action: "Share accessibility feedback",
      },
    ],
    sections: [
      {
        title: "Our reference, and the current limits.",
        copy: "WCAG 2.2 is a reference for improving accessibility. We do not claim a completed independent conformance audit across every AutoPromote workspace. Some timeline, canvas and media interactions still need further accessibility work.",
      },
    ],
  },
  cookies: {
    eyebrow: "PRIVACY / YOUR BROWSER STORAGE",
    title: "What your browser remembers.",
    intro:
      "AutoPromote uses browser storage as well as cookies and similar technologies. They serve different purposes, from keeping you signed in to retaining an editable project on your device.",
    cards: [
      {
        title: "Sign-in and preferences",
        copy: "Authentication storage helps retain your session. The app also remembers selected preferences on your device. Browser storage restrictions can affect sign-in and saved settings.",
      },
      {
        title: "Locally saved Studio projects",
        copy: "Studio stores saved projects in your browser. Clearing site data or changing browser profiles can remove those local copies. Download a project backup before clearing storage.",
        to: "/docs/studio",
        link: "Save and back up a project",
      },
      {
        title: "Third-party services",
        copy: "Connected sign-in providers, payment pages and external platforms apply their own storage and privacy practices. Review the notices presented when using those services.",
        to: "/privacy",
        link: "Read the privacy policy",
      },
    ],
    sections: [
      {
        title: "Manage storage in your browser.",
        copy: "Use your browser’s privacy and site-data settings to inspect or remove stored data. Signing out, clearing local projects and revoking a connected account are different actions. For a privacy request, contact thulani@autopromote.org.",
      },
    ],
  },
};
