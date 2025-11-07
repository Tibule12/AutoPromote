import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from datetime import date

home = os.path.expanduser('~')
downloads = os.path.join(home, 'Downloads')
if not os.path.exists(downloads):
    downloads = home

attestation_pdf = os.path.join(downloads, 'attestation.pdf')
readme_pdf = os.path.join(downloads, 'evidence_readme.pdf')
csv_pdf = os.path.join(downloads, 'evidence_inventory.pdf')
combined_pdf = os.path.join(downloads, 'evidence_package.pdf')

# Replace these with values filled by user (script will be called with environment variables)
name = os.environ.get('EVIDENCE_NAME', 'Thulani Mtshwelo')
email = os.environ.get('EVIDENCE_EMAIL', 'tmtshwelo21@gmail.com')
project = os.environ.get('EVIDENCE_PROJECT', 'AutoPromote')

# Create attestation PDF
styles = getSampleStyleSheet()
story = []
story.append(Paragraph('Attestation of Update & Antivirus Maintenance', styles['Title']))
story.append(Spacer(1,12))

body = f"""
I, {name}, am the sole operator of the {project} project. This attestation describes how I keep third‑party software, browsers, and antivirus up to date on systems used to develop and operate the application.

Processes in place:

- Operating System updates: Windows Update automatic updates enabled on developer systems; devices are checked and updated at least weekly.
- Antivirus: Microsoft Defender (or equivalent) is installed and configured for automatic definition updates; last update check shown in attached screenshot.
- Browsers: Chrome/Edge/Firefox configured to auto-update; current versions are shown in the attachments.
- Dependencies: Automated dependency scanning runs (e.g., Dependabot / GitHub Actions / Snyk) and security updates are applied as necessary; evidence attached.
- Inventory tracking: Representative device inventory with last hotfix and AV status is included (update_inventory.csv / evidence_inventory.pdf).

I certify the above is accurate as of the date below. Once staff are added, these controls will be applied organization-wide; I will maintain documentation and tooling to enforce automatic updates organization-wide.

Signed,

{name}
{email}
Date: {date.today().isoformat()}
"""

for para in body.split('\n'):
    if para.strip() == '':
        story.append(Spacer(1,6))
    else:
        story.append(Paragraph(para.replace('&','&amp;'), styles['Normal']))

try:
    doc = SimpleDocTemplate(attestation_pdf, pagesize=A4)
    doc.build(story)
    print('Wrote attestation PDF to:', attestation_pdf)
except Exception as e:
    print('Failed to create attestation PDF:', e)

# Merge PDFs using PyPDF2
try:
    import PyPDF2
except Exception:
    print('PyPDF2 not installed')
    raise

pdfs = [attestation_pdf]
if os.path.exists(readme_pdf): pdfs.append(readme_pdf)
if os.path.exists(csv_pdf): pdfs.append(csv_pdf)

merger = PyPDF2.PdfMerger()
for p in pdfs:
    try:
        merger.append(p)
    except Exception as e:
        print('Failed to append', p, e)

try:
    with open(combined_pdf, 'wb') as f:
        merger.write(f)
    print('Created combined PDF:', combined_pdf)
except Exception as e:
    print('Failed to write combined PDF:', e)

print('Done.')
