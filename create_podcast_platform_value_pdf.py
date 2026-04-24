from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT_PDF = "AutoPromote_Podcast_Creator_Value_Guide.pdf"
PAGE_MARGIN = 16 * mm


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleLarge",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#111827"),
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SubtitleSmall",
            parent=styles["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#4b5563"),
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#111827"),
            spaceBefore=8,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCopy",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1f2937"),
            spaceAfter=7,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Callout",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#7c2d12"),
            backColor=colors.HexColor("#fff7ed"),
            borderPadding=8,
            borderColor=colors.HexColor("#fdba74"),
            borderWidth=0.75,
            borderRadius=5,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableHeader",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=colors.white,
            spaceAfter=0,
            spaceBefore=0,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#1f2937"),
            spaceAfter=0,
            spaceBefore=0,
        )
    )
    return styles


def bullet_list(items, styles):
    return ListFlowable(
        [
            ListItem(Paragraph(item, styles["BodyCopy"]), leftIndent=8)
            for item in items
        ],
        bulletType="bullet",
        bulletFontName="Helvetica",
        bulletFontSize=9,
        bulletOffsetY=2,
        leftIndent=14,
    )


def build_pricing_table(styles):
    raw_data = [
        ["Offer", "Best For", "Why Pay"],
        [
            "Free",
            "Trying the platform, testing the workflow, learning the dashboard",
            "Enough to experience the system before committing. Good for trust-building and first uploads.",
        ],
        [
            "Premium subscription",
            "Active creators and podcasters publishing regularly",
            "Removes repeated friction by unlocking stronger AI clip workflow, cross-platform automation, and ongoing creator output.",
        ],
        [
            "Pro subscription",
            "Heavier users who need unlimited publishing, no watermark, and higher-touch support",
            "Makes sense when the platform becomes part of the business operation, not just an experiment.",
        ],
        [
            "Credits",
            "Optional high-effort actions such as AI processing and community boosts",
            "Users pay when they use resource-heavy actions instead of forcing every user into the same price tier.",
        ],
    ]

    data = []
    for row_index, row in enumerate(raw_data):
        style = styles["TableHeader"] if row_index == 0 else styles["TableBody"]
        data.append([Paragraph(cell, style) for cell in row])

    table = Table(data, colWidths=[28 * mm, 50 * mm, 90 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f9fafb")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f3f4f6")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def build_document():
    styles = build_styles()
    story = []

    story.append(Paragraph("AutoPromote for Podcast Creators", styles["TitleLarge"]))
    story.append(
        Paragraph(
            "A creator-facing explainer for why the platform matters, why some features are paid, and why your own podcast is a strong launch strategy.",
            styles["SubtitleSmall"],
        )
    )
    story.append(Paragraph("Date: 2026-04-21", styles["BodyCopy"]))
    story.append(
        Paragraph(
            "Core positioning: AutoPromote is a creator operations platform that helps people turn one piece of content into a repeatable publishing system across editing, repackaging, scheduling, optimization, and performance review.",
            styles["Callout"],
        )
    )

    story.append(Paragraph("1. Why This Platform Helps Users", styles["SectionHeading"]))
    story.append(
        Paragraph(
            "Most creators lose time in the gaps between recording and publishing. The pain is usually not only making the content. It is preparing multiple versions, writing captions, cutting clips, formatting for vertical platforms, scheduling, and then trying to understand what actually worked. AutoPromote is valuable because it reduces that repeated operational drag.",
            styles["BodyCopy"],
        )
    )
    story.append(
        bullet_list(
            [
                "It helps creators reuse one long-form recording across several platforms instead of starting over each time.",
                "It gives a clearer path from recording to short clips, captions, exports, and distribution.",
                "It keeps more of the workflow in one place, which reduces tool switching and manual repetition.",
                "It provides performance visibility so users can learn from what they publish instead of guessing every time.",
                "It is especially strong for podcasters, interview creators, educators, and anyone producing long-form conversations.",
            ],
            styles,
        )
    )

    story.append(Paragraph("2. Platform Benefits Users Can Understand Quickly", styles["SectionHeading"]))
    story.append(
        bullet_list(
            [
                "Multicam and reframing workflow: creators can shape conversation footage into cleaner, more engaging viewing for vertical and short-form channels.",
                "AI clip generation: long videos can be analyzed and converted into shorter moments for TikTok, Reels, Shorts, and similar platforms.",
                "Caption and hashtag support: creators get help packaging the clip for the platform they are publishing to.",
                "Scheduling and publishing control: creators can plan posts instead of manually posting one by one across destinations.",
                "Analytics and optimization feedback: users can see how content performs and make better next decisions.",
                "Community and boost mechanics: users can optionally spend credits on extra amplification actions instead of making every user pay for the same tools.",
            ],
            styles,
        )
    )

    story.append(Paragraph("3. Why Subscriptions Make Sense", styles["SectionHeading"]))
    story.append(
        Paragraph(
            "Subscription pricing makes sense when the user receives ongoing operational value every month. The recurring value here is access to workflow convenience, higher limits, and features that creators use repeatedly as part of their publishing routine.",
            styles["BodyCopy"],
        )
    )
    story.append(
        bullet_list(
            [
                "A subscription is not just paying for software. It is paying to remove repeated weekly friction from the content pipeline.",
                "If a podcaster publishes often, recurring access to stronger editing, clip generation, upload capacity, and automation becomes more valuable than isolated one-off tools.",
                "Free access is useful for discovery, but paid plans make sense once the user wants the platform to become part of their regular business workflow.",
                "Users who publish consistently usually value time savings, output consistency, and better packaging more than a low one-time purchase.",
            ],
            styles,
        )
    )

    story.append(Paragraph("4. Why Some Features Should Be Paid Separately", styles["SectionHeading"]))
    story.append(
        Paragraph(
            "Not every feature should be bundled into one flat plan. Some actions cost the platform more in compute, storage, or moderation overhead. Credits let the platform charge fairly for usage-heavy actions while keeping the base product accessible.",
            styles["BodyCopy"],
        )
    )
    story.append(
        bullet_list(
            [
                "AI clip generation and other video processing actions consume more resources than a normal dashboard action.",
                "Boost-style community actions and bounties are optional growth levers, so it is reasonable to let users pay when they use them.",
                "A hybrid model protects casual users from overpaying while still letting power users access deeper capability.",
                "This gives the product a cleaner story: subscribe for ongoing workflow value, buy credits for optional heavy-lift or growth actions.",
            ],
            styles,
        )
    )

    story.append(Spacer(1, 5))
    story.append(build_pricing_table(styles))
    story.append(Spacer(1, 10))

    story.append(Paragraph("5. Why This Is Strong for a Podcast Creator", styles["SectionHeading"]))
    story.append(
        Paragraph(
            "Podcasting is one of the best product-fit examples for AutoPromote because one episode can feed many outputs. A single conversation can become a full episode, several short clips, vertical speaker cuts, quote graphics, captions, and scheduled posts across several platforms.",
            styles["BodyCopy"],
        )
    )
    story.append(
        bullet_list(
            [
                "Long-form conversations naturally create highlight moments that can be repurposed into short clips.",
                "Podcast episodes often need vertical edits for mobile-first channels, which aligns with the editor's vertical output and clip workflow.",
                "A podcaster can demonstrate the platform honestly by showing a real before-and-after workflow from one episode.",
                "Using your own show as the main use case creates trust because you are dogfooding the same workflow you are selling.",
            ],
            styles,
        )
    )

    story.append(PageBreak())

    story.append(Paragraph("6. A Good Go-To-Market Story for You", styles["SectionHeading"]))
    story.append(
        Paragraph(
            "Your strategy makes sense if you position the product as something you actively use rather than something you are only trying to sell. A creator-led software story is stronger when users see that the tool solves a real workflow for the founder first.",
            styles["BodyCopy"],
        )
    )
    story.append(
        bullet_list(
            [
                "Lead with your own podcast workflow: record, cut, clip, caption, schedule, review results.",
                "Show the platform as a creator system, not only as a video editor.",
                "Use real examples from episodes to demonstrate how one source becomes multiple publishable assets.",
                "Teach users why the paid features exist by showing the extra output or extra leverage they create.",
                "Keep the promise practical: less manual work, more usable assets, better publishing consistency.",
            ],
            styles,
        )
    )

    story.append(Paragraph("7. Feature Showcase Flow You Can Demo", styles["SectionHeading"]))
    story.append(
        bullet_list(
            [
                "Start with the raw podcast recording and explain the problem: one episode, many platforms, too much repeated work.",
                "Show multicam or single-source reframing to demonstrate how the conversation becomes more watchable for short-form audiences.",
                "Show AI clip suggestions and explain that they help surface likely highlight moments faster.",
                "Show caption and packaging support to explain how the content becomes platform-ready.",
                "Show scheduling and publishing controls to explain how the workflow leaves the editing room and becomes distribution.",
                "Show analytics to prove that the platform is not only about making content, but also about learning what worked.",
            ],
            styles,
        )
    )

    story.append(Paragraph("8. Talking Points for Why Users Should Pay", styles["SectionHeading"]))
    story.append(
        bullet_list(
            [
                "Pay because the product saves recurring time, not because it uses flashy words.",
                "Pay because it helps turn one recording into a larger content system.",
                "Pay because stronger editing, clip generation, and publishing flow can increase weekly output quality and consistency.",
                "Pay for credits when you want optional heavy-lift actions such as extra AI processing or growth boosts.",
                "Stay on free if you are still exploring. Upgrade when the product becomes part of your operating rhythm.",
            ],
            styles,
        )
    )

    story.append(Paragraph("9. Suggested Founder Pitch", styles["SectionHeading"]))
    story.append(
        Paragraph(
            '"I am building AutoPromote because long-form creators, especially podcasters, should not have to repeat the same packaging and publishing work every week. One episode should become multiple usable assets. The platform helps creators edit, clip, optimize, schedule, and learn from content in one system. Free access lets people test the workflow. Subscriptions make sense when the creator wants ongoing output and less friction. Credits make sense for optional high-cost actions like AI processing and boosts."',
            styles["BodyCopy"],
        )
    )

    story.append(Paragraph("10. Final Positioning", styles["SectionHeading"]))
    story.append(
        Paragraph(
            "AutoPromote should be presented as a creator workflow platform first and a video editor second. That framing is stronger because users are not really paying only for cutting video. They are paying for a cleaner path from recording to distribution and for optional power tools when they need more leverage.",
            styles["BodyCopy"],
        )
    )
    story.append(
        Paragraph(
            "Prepared for founder use, podcast demos, creator onboarding, and subscription conversations.",
            styles["SubtitleSmall"],
        )
    )

    doc = SimpleDocTemplate(
        OUTPUT_PDF,
        pagesize=A4,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN,
    )
    doc.build(story)
    print(f"Saved PDF to {OUTPUT_PDF}")


if __name__ == "__main__":
    build_document()