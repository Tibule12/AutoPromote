from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from PIL import Image
import csv
import os
import textwrap

output_pdf = "Combined_Render_Evidence.pdf"
policy_pdf = "MFA_Policy_OnePage.pdf"
img_top = "02_Render_Workspace_Security_Enabled.png"
img_team = "03_Render_Team_Members.png"
ssh_img = "04_Render_SSH_Public_Keys.png"
audit_csv = "05_Render_Audit_Log_redacted.csv"

PAGE_W, PAGE_H = A4
MARGIN = 15 * mm

def add_policy_page(c):
    # If policy PDF exists, just note it; otherwise generate a simple header page
    if os.path.isfile(policy_pdf):
        c.showPage()
        c.setFont("Helvetica-Bold", 12)
        c.drawString(MARGIN, PAGE_H - MARGIN, "MFA Policy (see attached policy file)")
    else:
        c.showPage()
        c.setFont("Helvetica-Bold", 14)
        c.drawString(MARGIN, PAGE_H - MARGIN, "Multi-Factor Authentication Policy — Remote Access")
        body = (
            "This organization requires MFA for all remote server access (SSH, RDP, VPN, bastion). "
            "Evidence pages show workspace enforcement, team members, SSH key management, and audit logs."
        )
        c.setFont("Helvetica", 10)
        y = PAGE_H - MARGIN - 20
        for line in textwrap.wrap(body, 100):
            c.drawString(MARGIN, y, line)
            y -= 12

def place_image(c, img_path):
    c.showPage()
    if not os.path.isfile(img_path):
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(MARGIN, PAGE_H - MARGIN - 20, f"[Missing image: {img_path}]")
        return
    img = Image.open(img_path)
    iw, ih = img.size
    max_w = PAGE_W - 2 * MARGIN
    max_h = PAGE_H - 2 * MARGIN
    ratio = iw / ih
    if iw > ih:
        draw_w = max_w
        draw_h = max_w / ratio
        if draw_h > max_h:
            draw_h = max_h
            draw_w = draw_h * ratio
    else:
        draw_h = max_h
        draw_w = max_h * ratio
        if draw_w > max_w:
            draw_w = max_w
            draw_h = draw_w / ratio
    x = (PAGE_W - draw_w) / 2
    y = (PAGE_H - draw_h) / 2
    c.drawImage(img_path, x, y, width=draw_w, height=draw_h, preserveAspectRatio=True, anchor='c')

def add_csv_snippet(c, csv_path, max_rows=10):
    c.showPage()
    c.setFont("Helvetica-Bold", 12)
    c.drawString(MARGIN, PAGE_H - MARGIN, "Audit log snippet (redacted)")
    if not os.path.isfile(csv_path):
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(MARGIN, PAGE_H - MARGIN - 20, f"[Missing CSV: {csv_path}]")
        return
    # Read CSV and render rows
    rows = []
    try:
        with open(csv_path, newline='', encoding='utf-8') as f:
            reader = csv.reader(f)
            for i, row in enumerate(reader):
                rows.append(row)
                if i >= max_rows:
                    break
    except Exception as e:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(MARGIN, PAGE_H - MARGIN - 20, f"[Could not read CSV: {e}]")
        return
    # draw rows as text
    c.setFont("Helvetica", 8)
    y = PAGE_H - MARGIN - 24
    for row in rows:
        line = ' | '.join(row)
        wrapped = textwrap.wrap(line, 140)
        for ln in wrapped:
            c.drawString(MARGIN, y, ln)
            y -= 10
            if y < MARGIN:
                c.showPage()
                y = PAGE_H - MARGIN

def main():
    c = canvas.Canvas(output_pdf, pagesize=A4)
    c.setTitle("Combined Render Evidence")
    # cover/policy
    add_policy_page(c)
    # images
    place_image(c, img_top)
    place_image(c, img_team)
    place_image(c, ssh_img)
    # csv snippet
    add_csv_snippet(c, audit_csv, max_rows=8)
    c.save()
    print(f"Saved combined evidence PDF to {output_pdf}")

if __name__ == '__main__':
    main()
