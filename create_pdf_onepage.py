from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from PIL import Image
import os, sys

# Filenames - change only if you named the images differently
img_top = "02_Render_Workspace_Security_Enabled.png"
img_bottom = "03_Render_Team_Members.png"

output_pdf = "Render_MFA_Evidence_onepage.pdf"
app_owner = "App owner: tmtshwelo21@gmail.com"  # <-- REPLACE this text with the exact name/email used in App Review
header_text = "Render workspace — MFA enforcement evidence"
caption_text = f"This document shows workspace-level MFA enforcement for the Render workspace and the app owner ({app_owner}). No OTPs, backup codes, or private keys are included."

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 15 * mm
GAP = 6 * mm  # gap between the two images
HEADER_HEIGHT = 28 * mm
CAPTION_HEIGHT = 18 * mm

def place_image_on_canvas(c, img_path, x, y, max_w, max_h):
    img = Image.open(img_path)
    img_w_px, img_h_px = img.size
    # Assume 72 DPI for point conversion; we scale relative to pixel ratio only.
    img_ratio = img_w_px / img_h_px
    page_ratio = max_w / max_h
    if img_ratio > page_ratio:
        draw_w = max_w
        draw_h = max_w / img_ratio
    else:
        draw_h = max_h
        draw_w = max_h * img_ratio
    # center horizontally within max area
    draw_x = x + (max_w - draw_w) / 2
    draw_y = y + (max_h - draw_h) / 2
    c.drawImage(img_path, draw_x, draw_y, width=draw_w, height=draw_h, preserveAspectRatio=True, anchor='c')

def main():
    c = canvas.Canvas(output_pdf, pagesize=A4)
    c.setTitle("Render MFA Evidence (one page)")

    # Header
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN, PAGE_HEIGHT - MARGIN - 12, header_text)

    # Caption (multi-line)
    c.setFont("Helvetica", 9)
    text_obj = c.beginText()
    text_obj.setTextOrigin(MARGIN, PAGE_HEIGHT - MARGIN - 28)
    text_obj.textLines(caption_text)
    c.drawText(text_obj)

    # Compute available box for two images stacked
    top_area_y = MARGIN
    available_top = PAGE_HEIGHT - (MARGIN + HEADER_HEIGHT + CAPTION_HEIGHT) - MARGIN
    # The area we allocate for both images:
    total_image_area_h = PAGE_HEIGHT - (MARGIN + HEADER_HEIGHT + CAPTION_HEIGHT + MARGIN)
    if total_image_area_h <= 0:
        print("Page size not enough.")
        sys.exit(1)

    # Each image area (width limited by page width minus margins)
    max_w = PAGE_WIDTH - 2 * MARGIN
    # each image height
    each_h = (total_image_area_h - GAP) / 2

    # Top image coordinates (x,y) bottom-left corner of area
    top_x = MARGIN
    top_y = MARGIN + each_h + GAP

    # Bottom image coordinates
    bottom_x = MARGIN
    bottom_y = MARGIN

    # Place top image
    if os.path.isfile(img_top):
        place_image_on_canvas(c, img_top, top_x, top_y, max_w, each_h)
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(MARGIN, top_y + each_h / 2, f"[Missing image: {img_top}]")

    # Place bottom image
    if os.path.isfile(img_bottom):
        place_image_on_canvas(c, img_bottom, bottom_x, bottom_y, max_w, each_h)
    else:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(MARGIN, bottom_y + each_h / 2, f"[Missing image: {img_bottom}]")

    c.save()
    print(f"Saved PDF to {output_pdf}")

if __name__ == "__main__":
    main()
