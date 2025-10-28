from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
import textwrap

output_pdf = "MFA_Policy_OnePage.pdf"
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 20 * mm

policy_text = (
    "MFA Policy for Remote Server Access\n\n"
    "Purpose:\n"
    "This policy mandates the use of multi-factor authentication (MFA) for all remote access to servers, \n"
    "including SSH, RDP, VPN, bastion/jump hosts, and any administrative consoles that provide access to \n"
    "production or sensitive environments.\n\n"
    "Policy Statement:\n"
    "All users, contractors, and service accounts that have remote access to infrastructure managed by the \n"
    "organization must authenticate using at least two distinct factors: something they know (password) and \n"
    "something they have (authenticator app, hardware token, or SMS where applicable). Where possible, hardware \n"
    "security keys or authenticator apps (TOTP) are preferred over SMS.\n\n"
    "Enforcement and Evidence:\n"
    "The organization enforces this policy through Identity Provider (IdP) configuration, workspace/team settings, \n"
    "VPN/bastion settings, and cloud IAM controls. Evidence of enforcement includes: (1) workspace/team setting \n"
    "showing MFA enforced, (2) audit logs demonstrating MFA-protected sign-ins or sessions, and (3) a list of users \n"
    "and their 2FA enrollment status.\n\n"
    "Exceptions:\n"
    "Any exceptions must be documented and approved by security leadership with compensating controls in place.\n\n"
    "Contact:\n"
    "Security Team — security@example.com\n"
)

def create_pdf():
    c = canvas.Canvas(output_pdf, pagesize=A4)
    c.setTitle("MFA Policy — One Page")

    # Header
    c.setFont("Helvetica-Bold", 16)
    c.drawString(MARGIN, PAGE_HEIGHT - MARGIN, "Multi-Factor Authentication Policy — Remote Access")

    # Body
    c.setFont("Helvetica", 10)
    wrapped = textwrap.wrap(policy_text, 120)
    y = PAGE_HEIGHT - MARGIN - 20
    for line in wrapped:
        c.drawString(MARGIN, y, line)
        y -= 12
        if y < MARGIN:
            c.showPage()
            y = PAGE_HEIGHT - MARGIN

    c.save()
    print(f"Saved policy PDF to {output_pdf}")

if __name__ == '__main__':
    create_pdf()
