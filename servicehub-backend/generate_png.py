from PIL import Image, ImageDraw, ImageFont
import os

WIDTH, HEIGHT = 1600, 900
PATH = os.path.join(os.getcwd(), 'system-test-evaluation.png')

img = Image.new('RGBA', (WIDTH, HEIGHT), (245, 247, 250, 255))
d = ImageDraw.Draw(img)

# background gradient-ish effect
for y in range(HEIGHT):
    r = int(245 + (y / HEIGHT) * 18)
    g = int(247 + (y / HEIGHT) * 12)
    b = int(250 + (y / HEIGHT) * 11)
    d.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

font_title = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 36)
font_sub = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
font_big = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 40)
font_med = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
font_small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)

# Title section
text = 'Website Evaluation Performance'
d.text((110, 58), text, font=font_title, fill=(15, 23, 42, 255))
d.text((110, 100), 'System Testing & Verification Results', font=font_sub, fill=(71, 85, 105, 255))

# Metric cards
cards = [
    (110, 170, 260, 150, (238, 242, 255, 255), (79, 70, 229, 255), '96.4%', 'FUNCTIONAL', '✓'),
    (390, 170, 260, 150, (236, 254, 255, 255), (8, 145, 178, 255), '94.7%', 'API RELIABILITY', '◎'),
    (670, 170, 260, 150, (236, 253, 245, 255), (5, 150, 105, 255), '91.3%', 'UI RESPONSE', '◔'),
    (950, 170, 260, 150, (254, 243, 199, 255), (217, 119, 6, 255), '96.1%', 'SECURITY', '!'),
]

for x, y, w, h, bg, accent, value, label, icon in cards:
    d.rounded_rectangle((x + 8, y + 8, x + w, y + h), radius=22, fill=(226, 232, 240, 200))
    d.rounded_rectangle((x, y, x + w, y + h), radius=22, fill=(255, 255, 255, 255))
    d.rounded_rectangle((x + 24, y + 24, x + 70, y + 70), radius=20, fill=bg)
    d.text((x + 34, y + 30), icon, font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 28), fill=accent)
    d.text((x + 28, y + 92), label, font=font_small, fill=(100, 116, 139, 255))
    d.text((x + 28, y + 116), value, font=font_big, fill=(15, 23, 42, 255))

# Main chart panel
panel_x, panel_y, panel_w, panel_h = 110, 370, 1100, 360
d.rounded_rectangle((panel_x, panel_y, panel_x + panel_w, panel_y + panel_h), radius=28, fill=(255, 255, 255, 255))
d.text((152, 420), 'Verification Score Overview', font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 24), fill=(15, 23, 42, 255))
for yy in [505, 553, 601, 649]:
    d.line([(150, yy), (1070, yy)], fill=(226, 232, 240, 255), width=2)

bars = [
    ('Functional', 150, 96, 120, 92, (79, 70, 229, 255), '96%'),
    ('API', 330, 108, 120, 80, (6, 182, 212, 255), '95%'),
    ('UI/UX', 520, 120, 120, 68, (16, 185, 129, 255), '91%'),
    ('Security', 720, 94, 120, 94, (245, 158, 11, 255), '96%'),
    ('Regression', 910, 82, 120, 106, (16, 185, 129, 255), '97%'),
]

for label, x0, y0, w, h, col, value in bars:
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=16, fill=col)
    d.text((x0 + 18, y0 - 24), value, font=font_med, fill=(51, 65, 85, 255))
    d.text((x0 + 18, y0 + h + 22), label, font=font_small, fill=(71, 85, 105, 255))

# Status box
status_x, status_y = 1235, 370
status_w, status_h = 260, 270
d.rounded_rectangle((status_x, status_y, status_x + status_w, status_y + status_h), radius=28, fill=(255, 255, 255, 255))
d.text((1268, 410), 'Status', font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 22), fill=(15, 23, 42, 255))
status_items = [
    (450, (220, 252, 231, 255), 'PASS', (22, 101, 52, 255)),
    (518, (219, 234, 254, 255), 'VERIFIED', (29, 78, 216, 255)),
    (586, (237, 233, 254, 255), 'READY', (109, 40, 217, 255)),
]
for y, fill, text_value, color in status_items:
    d.rounded_rectangle((1268, y, 1468, y + 52), radius=14, fill=fill)
    d.text((1292, y + 14), text_value, font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18), fill=color)

# Footer
text_avg = 'Average verified performance:'
d.text((110, 760), text_avg, font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18), fill=(51, 65, 85, 255))
d.text((400, 750), '94.8%', font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 30), fill=(15, 23, 42, 255))
d.text((560, 760), 'System checks completed successfully and deployment readiness confirmed.', font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16), fill=(71, 85, 105, 255))

img.save(PATH)
print(f'PNG created: {PATH}')
print(f'File size: {os.path.getsize(PATH)} bytes')
