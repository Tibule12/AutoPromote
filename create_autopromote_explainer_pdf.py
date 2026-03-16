from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
import textwrap

OUTPUT_PDF = "AutoPromote_Explainer_OnePage.pdf"
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 16 * mm
LINE_HEIGHT = 12

TITLE = "AutoPromote: Clear Product Explainer (Presentation One-Pager)"
SUBTITLE = "Use this to introduce AutoPromote clearly and avoid confusion"

SECTIONS = [
    (
        "1) One-Line Positioning",
        [
            "AutoPromote is a cross-platform publishing control layer that helps creators and small teams upload once,"
            "schedule deliberately, and track what happened across connected platforms.",
        ],
    ),
    (
        "2) What AutoPromote DOES",
        [
            "Centralized publishing workflow: one place to prepare and send content to multiple platforms.",
            "Scheduling and queue control: publish now or schedule later with status visibility.",
            "History and traceability: review uploaded content, publishing state, and outcomes.",
            "Analytics visibility: view available platform performance signals in one dashboard.",
            "Packaging support: edit clips, captions, and formatting before publishing.",
        ],
    ),
    (
        "3) What AutoPromote DOES NOT DO",
        [
            "It does not guarantee virality, growth, or revenue outcomes.",
            "It does not bypass platform policies, moderation, or API restrictions.",
            "It does not replace native platforms for every feature they launch first.",
            "It does not promise identical posting capabilities for every account/environment.",
            "It does not eliminate the need for content quality, strategy, or audience fit.",
        ],
    ),
    (
        "4) Best-Fit Users",
        [
            "Creators posting the same core content to multiple platforms.",
            "Small teams/agencies needing reliable execution and visibility.",
            "Operators who value workflow control over hype automation claims.",
        ],
    ),
    (
        "5) Simple Talk Track (30-45 seconds)",
        [
            '"AutoPromote helps us run cross-platform publishing like an operation instead of repeating manual tasks in each app. We upload once, choose destinations, schedule intentionally, and monitor status and available analytics in one place. It improves execution clarity and consistency, but it does not promise viral results or bypass platform rules."',
        ],
    ),
    (
        "6) Questions You Can Pre-Answer",
        [
            "Q: Will this make every post viral?  A: No, it improves workflow and decision quality, not guaranteed outcomes.",
            "Q: Can it post everywhere automatically with full parity?  A: Capability depends on connected account permissions and platform APIs.",
            "Q: Why use it instead of native apps only?  A: It reduces repeated cross-platform operational work and improves visibility.",
        ],
    ),
]


def draw_wrapped_lines(c, text, x, y, width_chars=105, bullet=False):
    prefix = "- " if bullet else ""
    wrapped = textwrap.wrap(text, width=width_chars)
    first = True
    for line in wrapped:
        c.drawString(x, y, (prefix if first else "  ") + line)
        y -= LINE_HEIGHT
        first = False
    return y


def create_pdf():
    c = canvas.Canvas(OUTPUT_PDF, pagesize=A4)
    c.setTitle("AutoPromote Explainer One Pager")

    y = PAGE_HEIGHT - MARGIN

    c.setFont("Helvetica-Bold", 15)
    c.drawString(MARGIN, y, TITLE)
    y -= 16

    c.setFont("Helvetica-Oblique", 10)
    c.drawString(MARGIN, y, SUBTITLE)
    y -= 18

    c.setFont("Helvetica", 9)
    c.drawString(MARGIN, y, "Date: 2026-03-16")
    y -= 14

    for section_title, bullets in SECTIONS:
        if y < 70:
            c.showPage()
            y = PAGE_HEIGHT - MARGIN

        c.setFont("Helvetica-Bold", 11)
        c.drawString(MARGIN, y, section_title)
        y -= 12

        c.setFont("Helvetica", 10)
        for bullet in bullets:
            y = draw_wrapped_lines(c, bullet, MARGIN, y, bullet=True)
            y -= 3

        y -= 4

    c.setFont("Helvetica-Oblique", 8)
    c.drawString(
        MARGIN,
        12 * mm,
        "Prepared for product introduction and stakeholder presentations.",
    )

    c.save()
    print(f"Saved PDF to {OUTPUT_PDF}")


if __name__ == "__main__":
    create_pdf()
