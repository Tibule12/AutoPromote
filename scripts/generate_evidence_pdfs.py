import os
import csv
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
readme_path = os.path.join(repo_root, 'EVIDENCE_README.md')
csv_sample = os.path.join(repo_root, 'evidence', 'update_inventory.csv')
# fallback to sample csv if real one doesn't exist
if not os.path.exists(csv_sample):
    csv_sample = os.path.join(repo_root, 'evidence', 'update_inventory_sample.csv')

home = os.path.expanduser('~')
downloads = os.path.join(home, 'Downloads')
if not os.path.exists(downloads):
    downloads = home  # fallback

readme_pdf = os.path.join(downloads, 'evidence_readme.pdf')
csv_pdf = os.path.join(downloads, 'evidence_inventory.pdf')

styles = getSampleStyleSheet()

# Create README PDF
story = []
if os.path.exists(readme_path):
    with open(readme_path, 'r', encoding='utf-8') as f:
        md = f.read()
else:
    md = 'EVIDENCE_README.md not found in repo.'

# Simple rendering: split by lines, use Paragraph for paragraphs and Preformatted for code blocks
for line in md.splitlines():
    if line.strip().startswith('```'):
        # begin or end of code block — for simplicity, skip the fence
        continue
    if line.strip().startswith('    ') or line.strip().startswith('\t') or line.startswith('    '):
        story.append(Preformatted(line, styles['Code']))
    elif line.strip() == '':
        story.append(Spacer(1, 6))
    else:
        story.append(Paragraph(line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'), styles['Normal']))

# Write README PDF
doc = SimpleDocTemplate(readme_pdf, pagesize=A4)
try:
    doc.build(story)
    print('Wrote README PDF to:', readme_pdf)
except Exception as e:
    print('Failed to write README PDF:', e)

# Create CSV PDF
if os.path.exists(csv_sample):
    table_data = []
    try:
        with open(csv_sample, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                table_data.append(row)
    except Exception as e:
        table_data = [['Error reading CSV', str(e)]]
else:
    table_data = [['CSV not found', csv_sample]]

# Limit column widths and prepare table
col_count = max(len(r) for r in table_data)
col_widths = [80] * col_count

table = Table(table_data, colWidths=col_widths)
style = TableStyle([
    ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
    ('BACKGROUND', (0,0), (-1,0), colors.lightgrey),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
])
table.setStyle(style)

# Build CSV PDF
doc2 = SimpleDocTemplate(csv_pdf, pagesize=A4)
story2 = [Paragraph('Evidence inventory (CSV)', styles['Heading2']), Spacer(1,6), table]
try:
    doc2.build(story2)
    print('Wrote CSV PDF to:', csv_pdf)
except Exception as e:
    print('Failed to write CSV PDF:', e)

print('\nDone.')
