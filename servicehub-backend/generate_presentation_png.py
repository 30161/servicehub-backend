from PIL import Image, ImageDraw, ImageFont
import os

WIDTH, HEIGHT = 1600, 900
OUT_PATH = os.path.join(os.getcwd(), 'system-test-evaluation-presentation.png')

img = Image.new('RGBA', (WIDTH, HEIGHT), (248, 250, 255, 255))
d = ImageDraw.Draw(img)

# Clean background gradient
for y in range(HEIGHT):
    r = int(248 + (y / HEIGHT) * 12)
    g = int(250 + (y / HEIGHT) * 8)
    b = int(255 + (y / HEIGHT) * 0)
    d.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

# Fonts
font_title = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 38)
font_sub = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
font_card = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 26)
font_small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
font_bar = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
font_footer = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
font_status = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)

# Title
# subtle accent pill
accent_bar = (79, 70, 229, 255)
d.rounded_rectangle((110, 52, 530, 88), radius=18, fill=(238, 242, 255, 255))
d.text((136, 56), 'SYSTEM TESTING & VERIFICATION', font=font_sub, fill=accent_bar)
d.text((110, 108), 'Website Evaluation Performance', font=font_title, fill=(15, 23, 42, 255))

# Cards
cards = [
    (110, 170, 260, 150, (79, 70, 229), '96.4%', 'FUNCTIONAL', '✓'),
    (390, 170, 260, 150, (14, 165, 233), '94.7%', 'API RELIABILITY', '◎'),
    (670, 170, 260, 150, (16, 185, 129), '91.3%', 'UI RESPONSE', '◔'),
    (950, 170, 260, 150, (245, 158, 11), '96.1%', 'SECURITY', '!')
]

for x, y, w, h, color, value, label, icon in cards:
    d.rounded_rectangle((x, y, x + w, y + h), radius=22, fill=(255, 255, 255, 255))
    d.rounded_rectangle((x + 20, y + 18, x + 74, y + 72), radius=18, fill=(255, 255, 255, 255))
    d.rounded_rectangle((x + 24, y + 22, x + 70, y + 68), radius=16, fill=(color[0], color[1], color[2], 40))
    d.text((x + 32, y + 24), icon, font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 26), fill=color)
    d.text((x + 28, y + 92), label, font=font_small, fill=(71, 85, 105, 255))
    d.text((x + 28, y + 112), value, font=font_card, fill=(15, 23, 42, 255))

# Main chart panel
chart_x, chart_y, chart_w, chart_h = 110, 360, 1100, 330
d.rounded_rectangle((chart_x, chart_y, chart_x + chart_w, chart_y + chart_h), radius=26, fill=(255, 255, 255, 255))
d.text((150, 392), 'Verification Score Overview', font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 24), fill=(15, 23, 42, 255))

# Grid lines
for yy in [445, 500, 555, 610, 665]:
    d.line([(150, yy), (1180, yy)], fill=(226, 232, 240, 255), width=1)

# Bars
bars = [
    ('Functional', 180, 530, 120, 112, (79, 70, 229), '96%'),
    ('API', 360, 560, 120, 82, (14, 165, 233), '95%'),
    ('UI/UX', 540, 592, 120, 50, (16, 185, 129), '91%'),
    ('Security', 720, 532, 120, 110, (245, 158, 11), '96%'),
    ('Regression', 900, 510, 120, 132, (99, 102, 241), '97%'),
]

for label, x0, y0, w, h, color, pct in bars:
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=16, fill=color)
    d.text((x0 + 18, y0 - 26), pct, font=font_bar, fill=(15, 23, 42, 255))
    d.text((x0 + 12, y0 + h + 16), label, font=font_small, fill=(71, 85, 105, 255))

# Status panel
status_x, status_y = 1235, 360
status_w, status_h = 260, 305
d.rounded_rectangle((status_x, status_y, status_x + status_w, status_y + status_h), radius=26, fill=(255, 255, 255, 255))
d.text((1275, 392), 'Status', font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 24), fill=(15, 23, 42, 255))
status_levels = [
    (1270, 440, 220, 45, (220, 252, 231, 255), (22, 101, 52, 255), 'PASS'),
    (1270, 500, 220, 45, (219, 234, 254, 255), (29, 78, 216, 255), 'VERIFIED'),
    (1270, 560, 220, 45, (237, 233, 254, 255), (109, 40, 217, 255), 'READY'),
]
for x, y, w, h, bg, fg, label in status_levels:
    d.rounded_rectangle((x, y, x + w, y + h), radius=12, fill=bg)
    d.text((x + 18, y + 10), label, font=font_status, fill=fg)

# Footer summary
summary = 'Average verified performance: 94.8%'
d.text((110, 755), summary, font=font_footer, fill=(51, 65, 85, 255))
d.text((110, 784), 'System checks completed successfully and deployment readiness confirmed.', font=font_footer, fill=(100, 116, 139, 255))

# Save
img.save(OUT_PATH)
print(f'Created: {OUT_PATH}')
print(f'File size: {os.path.getsize(OUT_PATH)} bytes')
