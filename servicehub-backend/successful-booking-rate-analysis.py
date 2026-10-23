from PIL import Image, ImageDraw, ImageFont
import os

WIDTH, HEIGHT = 1600, 900
OUT_PATH = os.path.join(os.getcwd(), 'successful-booking-rate-analysis.png')

img = Image.new('RGBA', (WIDTH, HEIGHT), (246, 249, 255, 255))
d = ImageDraw.Draw(img)

# subtle background gradient
for y in range(HEIGHT):
    r = int(246 + (y / HEIGHT) * 8)
    g = int(249 + (y / HEIGHT) * 6)
    b = int(255)
    d.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

# fonts
font_title = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 36)
font_sub = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
font_label = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)
font_big = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 28)
font_small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
font_note = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
font_status = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)

# title panel
pill = (79, 70, 229, 255)
d.rounded_rectangle((110, 52, 520, 88), radius=18, fill=(238, 242, 255, 255))
d.text((138, 58), 'BOOKING PERFORMANCE', font=font_sub, fill=pill)
d.text((110, 110), 'Successful Booking Rate Analysis', font=font_title, fill=(15, 23, 42, 255))

# main panel
panel_x, panel_y, panel_w, panel_h = 120, 180, 1125, 520
d.rounded_rectangle((panel_x, panel_y, panel_x + panel_w, panel_y + panel_h), radius=28, fill=(255, 255, 255, 255))

# chart area
chart_x1, chart_y1 = 210, 610
chart_x2, chart_y2 = 1080, 610
# y grid
for y in [610, 565, 520, 475, 430, 385, 340]:
    d.line([(210, y), (1080, y)], fill=(226, 232, 240, 255), width=1)
# x grid
for x in [260, 400, 540, 680, 820, 960, 1100]:
    d.line([(x, 340), (x, 610)], fill=(226, 232, 240, 255), width=1)

# axis labels
months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']
for label, x in zip(months, [260, 400, 540, 680, 820, 960, 1100]):
    d.text((x - 14, 628), label, font=font_label, fill=(71, 85, 105, 255))

# Y scale
for val, y in [('100%', 610), ('80%', 565), ('60%', 520), ('40%', 475), ('20%', 430), ('0%', 385)]:
    d.text((150, y - 12), val, font=font_small, fill=(100, 116, 139, 255))

# bars values
rates = [64, 70, 76, 82, 88, 94, 96]
bar_x = [240, 380, 520, 660, 800, 940, 1080]
bar_w = 60

for x, value in zip(bar_x, rates):
    h = (value / 100) * 230
    y0 = 610 - h
    d.rounded_rectangle((x, y0, x + bar_w, 610), radius=14, fill=(79, 70, 229, 220))
    d.text((x + 8, y0 - 26), f'{value}%', font=font_small, fill=(79, 70, 229, 255))

# trend line
points = [(x + 30, 610 - (r / 100) * 230) for x, r in zip(bar_x, rates)]
for i in range(len(points) - 1):
    x1, y1 = points[i]
    x2, y2 = points[i + 1]
    d.line([(x1, y1), (x2, y2)], fill=(34, 197, 94, 255), width=4)

# dots
for x, r in zip(bar_x, rates):
    y = 610 - (r / 100) * 230
    d.ellipse((x + 18, y - 8, x + 42, y + 16), fill=(34, 197, 94, 255))

# summary cards
summary_cards = [
    (125, 760, 260, 110, 'Average Booking Rate', '84.6%'),
    (410, 760, 260, 110, 'Peak Conversion', '96%'),
    (695, 760, 260, 110, 'Growth Trend', '+32%'),
]

for x, y, w, h, title, value in summary_cards:
    d.rounded_rectangle((x, y, x + w, y + h), radius=20, fill=(246, 248, 255, 255))
    d.text((x + 20, y + 22), title, font=font_small, fill=(71, 85, 105, 255))
    d.text((x + 20, y + 56), value, font=font_big, fill=(15, 23, 42, 255))

# interpretation note
note = 'Successful bookings improved steadily across the period, showing stronger conversion and higher trust in the booking flow.'
d.text((125, 890), note, font=font_note, fill=(30, 41, 59, 255))

img.save(OUT_PATH)
print(f'Created: {OUT_PATH}')
print(f'File size: {os.path.getsize(OUT_PATH)} bytes')
