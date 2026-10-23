from PIL import Image, ImageDraw, ImageFont
import os

WIDTH, HEIGHT = 1600, 900
OUT_PATH = os.path.join(os.getcwd(), 'latency-comparison-presentation.png')

img = Image.new('RGBA', (WIDTH, HEIGHT), (246, 249, 255, 255))
d = ImageDraw.Draw(img)

# background soft gradient
for y in range(HEIGHT):
    r = int(246 + (y / HEIGHT) * 10)
    g = int(249 + (y / HEIGHT) * 7)
    b = int(255 + (y / HEIGHT) * 0)
    d.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

# fonts
font_title = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 36)
font_sub = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
font_label = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)
font_big = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 28)
font_small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
font_note = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)

# title block
# accent pill
pill = (79, 70, 229, 255)
d.rounded_rectangle((110, 52, 510, 88), radius=18, fill=(238, 242, 255, 255))
d.text((138, 58), 'COMPARATIVE ANALYSIS', font=font_sub, fill=pill)
d.text((110, 110), 'Latency Comparison: Traditional vs. ProConnect', font=font_title, fill=(15, 23, 42, 255))

# central chart card
chart_x, chart_y, chart_w, chart_h = 120, 185, 1120, 500
d.rounded_rectangle((chart_x, chart_y, chart_x + chart_w, chart_y + chart_h), radius=28, fill=(255, 255, 255, 255))

# Chart axes
axis_x1, axis_y1 = 220, 600
axis_x2, axis_y2 = 1120, 600
# Y axis
for y in [600, 560, 520, 480, 440, 400, 360, 320]:
    d.line([(220, y), (1120, y)], fill=(226, 232, 240, 255), width=1)
# X axis
for x in [220, 360, 500, 640, 780, 920, 1060]:
    d.line([(x, 320), (x, 600)], fill=(226, 232, 240, 255), width=1)

# Titles on axes
for label, x in [('Request 1', 260), ('Request 2', 400), ('Request 3', 540), ('Request 4', 680), ('Request 5', 820), ('Request 6', 960), ('Request 7', 1100)]:
    d.text((x - 18, 622), label, font=font_label, fill=(71, 85, 105, 255))

# y labels
for val, y in [('250ms', 600), ('200ms', 560), ('150ms', 520), ('100ms', 480), ('50ms', 440), ('0ms', 400)]:
    d.text((150, y - 10), val, font=font_small, fill=(100, 116, 139, 255))

# bars
traditional = [190, 170, 220, 160, 145, 130, 120]
proconnect = [95, 90, 85, 80, 70, 65, 60]

# bar positions
x_positions = [235, 375, 515, 655, 795, 935, 1075]
bar_w = 58

# baseline area
for x, t, p in zip(x_positions, traditional, proconnect):
    # Traditional bar
    d.rounded_rectangle((x, 600 - t, x + bar_w, 600), radius=14, fill=(99, 102, 241, 220))
    # ProConnect bar
    d.rounded_rectangle((x + 50, 600 - p, x + 50 + bar_w, 600), radius=14, fill=(34, 197, 94, 220))

    # annotations
    d.text((x + 12, 600 - t - 24), f'{t}ms', font=font_small, fill=(79, 70, 229, 255))
    d.text((x + 62, 600 - p - 24), f'{p}ms', font=font_small, fill=(22, 101, 52, 255))

# legend
legend_x, legend_y = 220, 150
# traditional legend box
# Traditional marker
box = (legend_x, legend_y, legend_x + 20, legend_y + 20)
d.rounded_rectangle((legend_x, legend_y, legend_x + 22, legend_y + 22), radius=6, fill=(99, 102, 241, 220))
d.text((legend_x + 36, legend_y - 2), 'Traditional', font=font_note, fill=(51, 65, 85, 255))
# ProConnect marker
box2 = (legend_x + 190, legend_y, legend_x + 212, legend_y + 22)
d.rounded_rectangle((legend_x + 190, legend_y, legend_x + 212, legend_y + 22), radius=6, fill=(34, 197, 94, 220))
d.text((legend_x + 228, legend_y - 2), 'ProConnect', font=font_note, fill=(51, 65, 85, 255))

# Discussion block
summary_x, summary_y, summary_w, summary_h = 120, 700, 1120, 120
d.rounded_rectangle((summary_x, summary_y, summary_x + summary_w, summary_y + summary_h), radius=22, fill=(244, 247, 255, 255))
text1 = 'Observation: ProConnect consistently reduces latency across all request stages, with a peak improvement of up to 130ms.'
text2 = 'This demonstrates faster processing, lower network overhead, and better real-time responsiveness for service operations.'
d.text((150, 730), text1, font=font_note, fill=(30, 41, 59, 255))
d.text((150, 760), text2, font=font_note, fill=(30, 41, 59, 255))

# save
img.save(OUT_PATH)
print(f'Created: {OUT_PATH}')
print(f'File size: {os.path.getsize(OUT_PATH)} bytes')
