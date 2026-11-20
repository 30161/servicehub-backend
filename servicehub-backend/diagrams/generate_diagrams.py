from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).parent
WIDTH, HEIGHT = 1600, 1000
BG = "#F4F7FC"
INK = "#16233B"
MUTED = "#586981"
LINE = "#A5B4C7"
BLUE = "#4263EB"
TEAL = "#0E9F9A"
PURPLE = "#805AD5"
ORANGE = "#D97706"
GREEN = "#18875B"
WHITE = "#FFFFFF"

FONT_DIR = Path("C:/Windows/Fonts")
FONT_REGULAR = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 20)
FONT_SMALL = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 16)
FONT_BODY = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 19)
FONT_BOLD = ImageFont.truetype(str(FONT_DIR / "arialbd.ttf"), 22)
FONT_TITLE = ImageFont.truetype(str(FONT_DIR / "arialbd.ttf"), 36)
FONT_LABEL = ImageFont.truetype(str(FONT_DIR / "arialbd.ttf"), 17)


def new_canvas(title, subtitle):
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((70, 52, 94, 122), radius=10, fill=BLUE)
    draw.text((120, 48), title, fill=INK, font=FONT_TITLE)
    draw.text((122, 102), subtitle, fill=MUTED, font=FONT_REGULAR)
    draw.line((80, 155, WIDTH - 80, 155), fill="#D9E1EC", width=2)
    draw.text(
        (80, HEIGHT - 44),
        "ServiceHub / ProConnect  •  Conceptual system diagram — not a live database export",
        fill=MUTED,
        font=FONT_SMALL,
    )
    return image, draw


def wrapped_lines(text, font, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(candidate, font=font) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def card(draw, box, title, lines, accent=BLUE, font=FONT_BODY, line_gap=10):
    x1, y1, x2, y2 = box
    draw.rounded_rectangle((x1 + 5, y1 + 7, x2 + 5, y2 + 7), radius=22, fill="#E5EAF2")
    draw.rounded_rectangle(box, radius=22, fill=WHITE, outline="#DEE6F0", width=2)
    draw.rounded_rectangle((x1, y1, x2, y1 + 13), radius=7, fill=accent)
    draw.text((x1 + 24, y1 + 29), title, fill=INK, font=FONT_BOLD)
    y = y1 + 72
    max_width = x2 - x1 - 48
    for item in lines:
        for line in wrapped_lines(item, font, max_width - 20):
            draw.ellipse((x1 + 25, y + 8, x1 + 32, y + 15), fill=accent)
            draw.text((x1 + 43, y), line, fill=MUTED, font=font)
            y += font.size + 8
        y += line_gap


def arrow(draw, start, end, label=None, color=LINE, label_offset=(0, -24)):
    draw.line((start, end), fill=color, width=4)
    x1, y1 = start
    x2, y2 = end
    if abs(x2 - x1) >= abs(y2 - y1):
        direction = 1 if x2 >= x1 else -1
        points = [(x2, y2), (x2 - 13 * direction, y2 - 8), (x2 - 13 * direction, y2 + 8)]
    else:
        direction = 1 if y2 >= y1 else -1
        points = [(x2, y2), (x2 - 8, y2 - 13 * direction), (x2 + 8, y2 - 13 * direction)]
    draw.polygon(points, fill=color)
    if label:
        mx, my = (x1 + x2) // 2, (y1 + y2) // 2
        dx, dy = label_offset
        label_box = draw.textbbox((mx + dx, my + dy), label, font=FONT_LABEL)
        draw.rounded_rectangle(
            (label_box[0] - 7, label_box[1] - 4, label_box[2] + 7, label_box[3] + 4),
            radius=7,
            fill=BG,
        )
        draw.text((mx + dx, my + dy), label, fill=INK, font=FONT_LABEL)


def save(image, filename):
    path = OUT / filename
    image.save(path, format="PNG", optimize=True)
    print(f"Created {path}")


def input_output():
    image, draw = new_canvas(
        "ServiceHub input and output",
        "How user actions move through the application and return as useful results",
    )
    card(draw, (90, 245, 430, 700), "INPUTS", [
        "Customer: sign-in, service request, date, time, address",
        "Provider: profile, offered services, availability and location",
        "Performance dashboard: website URL for desktop/mobile analysis",
    ], BLUE)
    card(draw, (625, 295, 975, 650), "APPLICATION", [
        "Express REST API",
        "Authentication and role handling",
        "Provider discovery and diagnosis",
        "Booking, OTP and location tracking",
        "PageSpeed analysis integration",
    ], PURPLE)
    card(draw, (1170, 245, 1510, 700), "OUTPUTS", [
        "Provider cards and saved favorites",
        "Diagnosis summary and estimate",
        "Booking confirmation and status",
        "Live location updates",
        "Desktop/mobile audit report",
    ], TEAL)
    arrow(draw, (430, 455), (625, 455), "request")
    arrow(draw, (975, 455), (1170, 455), "response")
    card(draw, (650, 735, 950, 880), "PERSISTENCE", [
        "MongoDB stores users, bookings, pools, logs and analyses",
    ], GREEN, font=FONT_SMALL, line_gap=4)
    arrow(draw, (800, 650), (800, 735), "read / write", label_offset=(18, -8))
    save(image, "01-input-output-flow.png")


def er_diagram():
    image, draw = new_canvas(
        "ServiceHub entity relationship diagram",
        "MongoDB collections and document references defined by the project models",
    )
    card(draw, (95, 220, 445, 470), "ACTIVITYLOG", [
        "userEmail, userName",
        "actionType, details",
        "createdAt",
    ], ORANGE, font=FONT_SMALL, line_gap=3)
    card(draw, (600, 205, 1000, 510), "USER", [
        "_id, name, email, password",
        "roles, activeRole, phone, service",
        "location, verified, rating",
        "customerProfile and providerProfile are embedded",
        "preferredHelpers → User IDs",
    ], BLUE, font=FONT_SMALL, line_gap=4)
    card(draw, (1150, 220, 1505, 470), "PERFORMANCEANALYSIS", [
        "websiteUrl, trigger, status",
        "desktop and mobile reports",
        "analyzedAt",
    ], PURPLE, font=FONT_SMALL, line_gap=3)
    card(draw, (170, 625, 650, 875), "BOOKING", [
        "customerId → User",
        "providerId → User",
        "service, date, timeSlot, address, amount",
        "status, escrowStatus, OTP and tracking",
    ], TEAL, font=FONT_SMALL, line_gap=3)
    card(draw, (950, 625, 1430, 875), "GROUPPOOL", [
        "service, neighborhood, targetSlots",
        "discount, status",
        "members → array of User IDs",
    ], GREEN, font=FONT_SMALL, line_gap=3)
    arrow(draw, (665, 510), (280, 625), "customerId", label_offset=(-20, -8))
    arrow(draw, (900, 510), (550, 625), "providerId", label_offset=(10, -8))
    arrow(draw, (1010, 625), (965, 510), "members", label_offset=(22, -5))
    draw.text((95, 910), "ActivityLog currently stores user identity as text; PerformanceAnalysis has no User reference.", fill=MUTED, font=FONT_SMALL)
    save(image, "02-entity-relationship-diagram.png")


def user_profile_database():
    image, draw = new_canvas(
        "User and profile database",
        "One MongoDB User document can carry customer, provider, or multiple roles",
    )
    card(draw, (90, 270, 420, 635), "ACCOUNT INPUT", [
        "Name, email, password",
        "Role selection",
        "Phone and service (optional)",
        "Password is hashed before creation",
    ], BLUE)
    card(draw, (610, 205, 1010, 725), "USERS DOCUMENT", [
        "_id, name, unique email, password hash",
        "roles[], activeRole, role",
        "phone, service, rating, location",
        "verified: govtId, criminalCheck, certified",
        "preferredHelpers[] references User IDs",
        "createdAt, updatedAt",
    ], PURPLE, font=FONT_SMALL, line_gap=4)
    card(draw, (1190, 190, 1510, 455), "EMBEDDED CUSTOMER PROFILE", [
        "preferences[]",
        "savedAddresses[]",
        "bookingHistory[] references Booking",
        "reviewsGiven[]",
        "favoriteProviders[] User IDs",
    ], TEAL, font=FONT_SMALL, line_gap=3)
    card(draw, (1190, 545, 1510, 830), "EMBEDDED PROVIDER PROFILE", [
        "profilePhoto, servicesOffered[]",
        "serviceCategory, description, skills[]",
        "experience, pricing, availability",
        "serviceLocation, ratings",
        "verificationStatus, bankDetails",
    ], GREEN, font=FONT_SMALL, line_gap=3)
    arrow(draw, (420, 450), (610, 450), "register / update")
    arrow(draw, (1010, 365), (1190, 325))
    arrow(draw, (1010, 560), (1190, 680))
    draw.text((610, 790), "Profiles are embedded subdocuments, not separate MongoDB collections.", fill=MUTED, font=FONT_SMALL)
    save(image, "03-user-profile-database.png")


def discovery_flow():
    image, draw = new_canvas(
        "Provider discovery and database flow",
        "Implemented provider listing route and the data returned for service cards",
    )
    card(draw, (80, 285, 365, 620), "CUSTOMER", [
        "Opens services page",
        "Chooses a provider card",
        "Can save a preferred helper",
    ], BLUE)
    card(draw, (475, 270, 800, 640), "PROVIDER API", [
        "GET /api/providers",
        "Queries User documents with role = provider",
        "Excludes password from response",
        "Returns provider list as JSON",
    ], PURPLE, font=FONT_SMALL, line_gap=5)
    card(draw, (925, 270, 1245, 640), "MONGODB: USERS", [
        "Provider profile is stored in User",
        "name, service, rating",
        "providerProfile details",
        "location and verification",
    ], TEAL)
    card(draw, (1310, 300, 1530, 610), "SERVICE CARD", [
        "Name and service",
        "Rating",
        "Displayed rate",
        "Book Visit action",
    ], GREEN, font=FONT_SMALL, line_gap=5)
    arrow(draw, (365, 390), (475, 390), "load list")
    arrow(draw, (800, 390), (925, 390), "find")
    arrow(draw, (1245, 390), (1310, 390), "JSON")
    card(draw, (380, 715, 825, 870), "FAVORITES", [
        "PUT /api/users/:id/favorites updates preferredHelpers; GET returns saved IDs",
    ], ORANGE, font=FONT_SMALL, line_gap=3)
    arrow(draw, (220, 620), (500, 715), "favorite toggle", label_offset=(10, -5))
    draw.text((900, 750), "Current route returns all provider-role users; it does not apply search filters server-side.", fill=MUTED, font=FONT_SMALL)
    save(image, "04-provider-discovery-database-flow.png")


def service_result_flow():
    image, draw = new_canvas(
        "Service diagnosis result",
        "Input symptoms are processed by the current rule-based diagnosis endpoint",
    )
    card(draw, (95, 270, 420, 640), "CUSTOMER INPUT", [
        "Category",
        "Free-text symptoms",
        "Example: AC does not cool",
    ], BLUE)
    card(draw, (635, 270, 965, 640), "POST /api/ai/diagnose", [
        "Combines category and symptoms",
        "Applies keyword rules",
        "AC-related terms select the AC response",
        "Other inputs use the default response",
    ], PURPLE, font=FONT_SMALL, line_gap=5)
    card(draw, (1170, 225, 1510, 705), "RESULT JSON", [
        "confidence",
        "probableRootCause",
        "estimatedCost",
        "precaution",
        "Returned to the UI for display",
    ], TEAL)
    arrow(draw, (420, 450), (635, 450), "request")
    arrow(draw, (965, 450), (1170, 450), "response")
    card(draw, (440, 745, 1140, 870), "IMPORTANT", [
        "This endpoint is rule-based and returns illustrative text; it does not query MongoDB or run a trained ML model.",
    ], ORANGE, font=FONT_SMALL, line_gap=3)
    save(image, "05-service-diagnosis-result.png")


def booking_flow():
    image, draw = new_canvas(
        "Service booking lifecycle",
        "Booking creation, persistence, tracking and OTP completion in the current API",
    )
    card(draw, (75, 265, 380, 675), "BOOKING INPUT", [
        "customerId and providerId",
        "service, date, timeSlot",
        "address and amount",
        "paymentMethod",
    ], BLUE, font=FONT_SMALL, line_gap=4)
    card(draw, (475, 265, 800, 675), "POST /api/bookings", [
        "Creates a Booking document",
        "Generates OTP if not supplied",
        "Default status: CONFIRMED",
        "Default escrow: HELD_IN_ESCROW",
    ], PURPLE, font=FONT_SMALL, line_gap=4)
    card(draw, (900, 265, 1190, 675), "MONGODB: BOOKINGS", [
        "Customer/provider references",
        "Service and appointment details",
        "Payment and escrow state",
        "OTP and location tracking fields",
    ], TEAL, font=FONT_SMALL, line_gap=4)
    card(draw, (1290, 225, 1530, 440), "CONFIRMATION", [
        "Booking response JSON",
        "Shown to customer and provider",
    ], GREEN, font=FONT_SMALL, line_gap=4)
    card(draw, (1290, 530, 1530, 790), "COMPLETION", [
        "Provider/customer verifies OTP",
        "Status → COMPLETED",
        "Escrow → RELEASED_TO_PROVIDER",
    ], ORANGE, font=FONT_SMALL, line_gap=4)
    arrow(draw, (380, 465), (475, 465), "POST")
    arrow(draw, (800, 465), (900, 465), "save")
    arrow(draw, (1190, 350), (1290, 335), "created")
    arrow(draw, (1190, 575), (1290, 640), "verify OTP")
    draw.text((460, 765), "During an active booking, provider location can be saved on the Booking and emitted to its Socket.IO room.", fill=MUTED, font=FONT_SMALL)
    save(image, "06-booking-flow.png")


def input_data_flow():
    image, draw = new_canvas(
        "ServiceHub input data flow",
        "Separate view of incoming user and dashboard data and where it goes",
    )
    lanes = [
        (195, "ACCOUNT INPUT", ["Name, email, password, role", "Phone and service (optional)"], BLUE,
         "REGISTER API", ["Hash password; validate account", "POST /api/auth/register"], PURPLE,
         "USERS COLLECTION", ["Account and role profile saved"], TEAL),
        (375, "BOOKING INPUT", ["Provider, service, date and time", "Address, amount and payment method"], BLUE,
         "BOOKING API", ["Validate and generate OTP if needed", "POST /api/bookings"], PURPLE,
         "BOOKINGS COLLECTION", ["Appointment and status saved"], TEAL),
        (555, "DIAGNOSIS INPUT", ["Category and free-text symptoms"], ORANGE,
         "DIAGNOSIS API", ["Rule-based diagnosis", "POST /api/ai/diagnose"], PURPLE,
         "IMMEDIATE RESPONSE", ["Result returned; not saved to MongoDB"], ORANGE),
        (735, "AUDIT INPUT", ["Website URL; manual or scheduled trigger"], BLUE,
         "ANALYSIS API", ["Request desktop and mobile PageSpeed reports"], PURPLE,
         "ANALYSIS COLLECTION", ["Report and status saved"], GREEN),
    ]
    for y, left_title, left_lines, left_color, mid_title, mid_lines, mid_color, right_title, right_lines, right_color in lanes:
        card(draw, (75, y, 430, y + 145), left_title, left_lines, left_color, font=FONT_SMALL, line_gap=2)
        card(draw, (625, y, 975, y + 145), mid_title, mid_lines, mid_color, font=FONT_SMALL, line_gap=2)
        card(draw, (1170, y, 1525, y + 145), right_title, right_lines, right_color, font=FONT_SMALL, line_gap=2)
        arrow(draw, (430, y + 72), (625, y + 72))
        arrow(draw, (975, y + 72), (1170, y + 72))
    save(image, "07-input-data-flow.png")


def output_data_flow():
    image, draw = new_canvas(
        "ServiceHub output data flow",
        "Separate view of API, database and external-service results returned to users",
    )
    card(draw, (80, 205, 430, 490), "MONGODB OUTPUTS", [
        "User and provider records",
        "Bookings and group pools",
        "Favorites and activity records",
        "Saved performance analyses",
    ], TEAL, font=FONT_SMALL, line_gap=5)
    card(draw, (80, 555, 430, 805), "LIVE / COMPUTED OUTPUTS", [
        "Diagnosis result from rule-based endpoint",
        "Provider location updates via Socket.IO",
        "PageSpeed desktop and mobile reports",
    ], PURPLE, font=FONT_SMALL, line_gap=5)
    card(draw, (620, 310, 950, 660), "EXPRESS API", [
        "Reads or creates project records",
        "Formats JSON responses",
        "Emits live booking-location events",
        "Returns errors for failed requests",
    ], BLUE, font=FONT_SMALL, line_gap=5)
    card(draw, (1150, 205, 1510, 490), "CUSTOMER OUTPUT", [
        "Provider cards and favorite IDs",
        "Booking confirmation and status",
        "Diagnosis report",
        "Provider tracking location",
    ], GREEN, font=FONT_SMALL, line_gap=5)
    card(draw, (1150, 555, 1510, 805), "DASHBOARD OUTPUT", [
        "Analysis history and latest report",
        "Desktop and mobile metrics",
        "Audit details and recommendations",
    ], ORANGE, font=FONT_SMALL, line_gap=5)
    arrow(draw, (430, 345), (620, 420), "read")
    arrow(draw, (430, 675), (620, 570), "computed / live")
    arrow(draw, (950, 420), (1150, 345), "JSON")
    arrow(draw, (950, 570), (1150, 675), "report / events")
    save(image, "08-output-data-flow.png")


def dataset_flow():
    image, draw = new_canvas(
        "ServiceHub dataset flow",
        "How project data is stored, related and consumed across MongoDB collections",
    )
    rows = [
        (195, "ACCOUNT / PROFILE INPUTS", [
            "Registration, role and provider listing",
        ], BLUE, "USERS COLLECTION", [
            "User account and role fields",
            "Embedded customerProfile / providerProfile",
        ], PURPLE, "DISCOVERY / FAVORITES", [
            "Provider list and favorite IDs",
        ], GREEN),
        (405, "BOOKING / ACTIVITY INPUTS", [
            "Appointments, group-pool joins, activity",
        ], BLUE, "SERVICE COLLECTIONS", [
            "Bookings reference customerId / providerId",
            "GroupPools store members[] User IDs",
            "ActivityLogs store identity as text",
        ], TEAL, "SERVICE VIEWS", [
            "Booking and provider pages",
            "Booking status and tracking",
        ], GREEN),
        (615, "WEBSITE AUDIT INPUT", [
            "URL and manual / scheduled trigger",
        ], BLUE, "PERFORMANCEANALYSES", [
            "Desktop and mobile reports",
            "Status, trigger and analyzedAt",
        ], ORANGE, "PERFORMANCE DASHBOARD", [
            "History, metrics and recommendations",
        ], GREEN),
    ]
    for y, left_title, left_lines, left_color, mid_title, mid_lines, mid_color, right_title, right_lines, right_color in rows:
        card(draw, (75, y, 440, y + 165), left_title, left_lines, left_color, font=FONT_SMALL, line_gap=2)
        card(draw, (610, y, 1010, y + 165), mid_title, mid_lines, mid_color, font=FONT_SMALL, line_gap=2)
        card(draw, (1180, y, 1525, y + 165), right_title, right_lines, right_color, font=FONT_SMALL, line_gap=2)
        arrow(draw, (440, y + 82), (610, y + 82))
        arrow(draw, (1010, y + 82), (1180, y + 82))
    draw.text((75, 825), "Customer and provider profiles are embedded in User, not stored in separate collections.", fill=MUTED, font=FONT_SMALL)
    draw.text((75, 855), "Diagnosis requests return a computed result and are not persisted by the current endpoint.", fill=MUTED, font=FONT_SMALL)
    save(image, "09-dataset-flow.png")


def dataset_table():
    image = Image.new("RGB", (1600, 1000), "#F3F4F6")
    draw = ImageDraw.Draw(image)
    dark = "#3C4043"
    grid = "#D6DAE0"
    header = "#E8EDF4"
    green = "#217346"

    draw.rectangle((0, 0, WIDTH, 43), fill=dark)
    draw.text((24, 11), "ServiceHub - sample booking dataset", fill=WHITE, font=FONT_SMALL)
    draw.text((1190, 11), "SYNTHETIC EXAMPLE DATA", fill="#BDE7CB", font=FONT_LABEL)

    draw.rectangle((0, 43, WIDTH, 92), fill="#F8F9FB")
    ribbon_items = ["File", "Home", "Insert", "Data", "Review", "View"]
    x = 25
    for item in ribbon_items:
        draw.text((x, 59), item, fill=INK if item == "Home" else MUTED, font=FONT_SMALL)
        if item == "Home":
            draw.line((x, 84, x + 43, 84), fill=green, width=3)
        x += 95
    draw.line((0, 92, WIDTH, 92), fill="#C8CDD5", width=2)

    draw.rectangle((0, 94, 70, 130), fill="#F8F9FB", outline=grid)
    draw.text((23, 102), "A1", fill=INK, font=FONT_SMALL)
    draw.rectangle((72, 94, WIDTH, 130), fill=WHITE, outline=grid)
    draw.text((92, 102), "bookingId", fill=INK, font=FONT_SMALL)

    columns = [
        ("bookingId", 122),
        ("customerEmail", 160),
        ("service", 145),
        ("date", 100),
        ("timeSlot", 115),
        ("address", 150),
        ("amount", 95),
        ("paymentMethod", 135),
        ("escrowStatus", 175),
        ("status", 145),
    ]
    rows = [
        ["BK-S001", "customer01@example.test", "Plumbing", "2026-10-01", "09:00-10:00", "North Park", "1200", "UPI", "HELD_IN_ESCROW", "CONFIRMED"],
        ["BK-S002", "customer02@example.test", "AC Service", "2026-10-02", "10:00-11:00", "Lake View", "1800", "Card", "RELEASED_TO_PROVIDER", "COMPLETED"],
        ["BK-S003", "customer03@example.test", "Electrical", "2026-10-03", "11:00-12:00", "Green Valley", "950", "UPI", "HELD_IN_ESCROW", "PROVIDER_EN_ROUTE"],
        ["BK-S004", "customer04@example.test", "Cleaning", "2026-10-04", "12:00-13:00", "West Garden", "1500", "Cash", "HELD_IN_ESCROW", "CONFIRMED"],
        ["BK-S005", "customer05@example.test", "Painting", "2026-10-05", "13:00-14:00", "River Side", "3200", "Card", "REFUNDED", "CANCELLED"],
        ["BK-S006", "customer06@example.test", "Plumbing", "2026-10-06", "14:00-15:00", "Hill Crest", "850", "UPI", "HELD_IN_ESCROW", "CONFIRMED"],
        ["BK-S007", "customer07@example.test", "AC Service", "2026-10-07", "15:00-16:00", "Central Block", "2100", "UPI", "DISPUTED", "CONFIRMED"],
        ["BK-S008", "customer08@example.test", "Electrical", "2026-10-08", "09:00-10:00", "Maple Town", "1100", "Cash", "RELEASED_TO_PROVIDER", "COMPLETED"],
        ["BK-S009", "customer09@example.test", "Cleaning", "2026-10-09", "10:00-11:00", "South Gate", "1350", "Card", "HELD_IN_ESCROW", "CONFIRMED"],
        ["BK-S010", "customer10@example.test", "Painting", "2026-10-10", "11:00-12:00", "Oak Residency", "4000", "UPI", "HELD_IN_ESCROW", "PROVIDER_EN_ROUTE"],
        ["BK-S011", "customer11@example.test", "Plumbing", "2026-10-11", "12:00-13:00", "Sunrise Colony", "750", "UPI", "RELEASED_TO_PROVIDER", "COMPLETED"],
        ["BK-S012", "customer12@example.test", "AC Service", "2026-10-12", "13:00-14:00", "Market Street", "1900", "Card", "HELD_IN_ESCROW", "CONFIRMED"],
        ["BK-S013", "customer13@example.test", "Electrical", "2026-10-13", "14:00-15:00", "Park Avenue", "1250", "Cash", "REFUNDED", "CANCELLED"],
        ["BK-S014", "customer14@example.test", "Cleaning", "2026-10-14", "15:00-16:00", "Meadow Lane", "1600", "UPI", "HELD_IN_ESCROW", "CONFIRMED"],
        ["BK-S015", "customer15@example.test", "Painting", "2026-10-15", "09:00-10:00", "Bluebell Enclave", "2800", "Card", "RELEASED_TO_PROVIDER", "COMPLETED"],
        ["BK-S016", "customer16@example.test", "Plumbing", "2026-10-16", "10:00-11:00", "Cedar Square", "980", "UPI", "HELD_IN_ESCROW", "CONFIRMED"],
    ]

    row_num_x = 0
    table_left = 70
    table_top = 164
    row_num_width = table_left
    header_height = 30
    row_height = 39
    draw.rectangle((0, table_top, WIDTH, table_top + header_height), fill="#DDE4EC")
    draw.rectangle((0, table_top, row_num_width, table_top + header_height), fill="#E8EDF4", outline=grid)
    draw.text((24, table_top + 6), "1", fill=MUTED, font=FONT_SMALL)

    x = table_left
    positions = []
    for index, (name, width) in enumerate(columns):
        x2 = min(x + width, WIDTH)
        positions.append((x, x2))
        draw.rectangle((x, table_top, x2, table_top + header_height), fill="#E2E8F0", outline=grid)
        letter = chr(ord("A") + index)
        draw.text((x + 5, table_top - 23), letter, fill=MUTED, font=FONT_SMALL)
        draw.text((x + 7, table_top + 6), name, fill=INK, font=FONT_LABEL)
        x = x2

    for row_index, row in enumerate(rows, start=2):
        y1 = table_top + header_height + (row_index - 2) * row_height
        y2 = y1 + row_height
        draw.rectangle((0, y1, row_num_width, y2), fill="#F0F2F5", outline=grid)
        draw.text((26, y1 + 8), str(row_index), fill=MUTED, font=FONT_SMALL)
        for col_index, ((x1, x2), value) in enumerate(zip(positions, row)):
            fill = WHITE if row_index % 2 == 0 else "#FBFCFD"
            draw.rectangle((x1, y1, x2, y2), fill=fill, outline=grid)
            font = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 14)
            max_text = x2 - x1 - 12
            text = value
            while text and draw.textlength(text, font=font) > max_text:
                text = text[:-2] + "…"
            draw.text((x1 + 6, y1 + 10), text, fill=INK, font=font)

    footer_y = table_top + header_height + len(rows) * row_height + 24
    draw.text((78, footer_y), "Columns follow the project Booking model. Customer emails, addresses and booking values above are fabricated examples.", fill=MUTED, font=FONT_SMALL)
    draw.text((78, footer_y + 30), "This is a spreadsheet-style dataset illustration, not a real database export.", fill=GREEN, font=FONT_LABEL)
    save(image, "10-servicehub-sample-dataset.png")


def discovery_results_table():
    image = Image.new("RGB", (1600, 1000), "#F3F4F6")
    draw = ImageDraw.Draw(image)
    grid = "#D6DAE0"
    green = "#217346"

    draw.rectangle((0, 0, WIDTH, 43), fill="#3C4043")
    draw.text((24, 11), "ServiceHub - provider discovery results", fill=WHITE, font=FONT_SMALL)
    draw.text((1215, 11), "SYNTHETIC EXAMPLE DATA", fill="#BDE7CB", font=FONT_LABEL)

    draw.rectangle((0, 43, WIDTH, 92), fill="#F8F9FB")
    x = 25
    for item in ["File", "Home", "Insert", "Data", "Review", "View"]:
        draw.text((x, 59), item, fill="#16233B" if item == "Home" else "#586981", font=FONT_SMALL)
        if item == "Home":
            draw.line((x, 84, x + 43, 84), fill=green, width=3)
        x += 95
    draw.line((0, 92, WIDTH, 92), fill="#C8CDD5", width=2)

    draw.rectangle((0, 94, 70, 130), fill="#F8F9FB", outline=grid)
    draw.text((23, 102), "A1", fill="#16233B", font=FONT_SMALL)
    draw.rectangle((72, 94, WIDTH, 130), fill=WHITE, outline=grid)
    draw.text((92, 102), "providerId", fill="#16233B", font=FONT_SMALL)

    columns = [
        ("providerId", 115),
        ("name", 145),
        ("service", 125),
        ("serviceCategory", 145),
        ("servicesOffered", 155),
        ("rating", 75),
        ("serviceLocation", 130),
        ("experience", 110),
        ("pricing", 110),
        ("availability", 120),
        ("verificationStatus", 145),
    ]
    rows = [
        ["PR-S001", "Asha Kumar", "Plumbing", "Home Repair", "Leak repair", "4.9", "North Park", "6 years", "₹500-900", "Weekdays", "verified"],
        ["PR-S002", "Ravi Nair", "AC Service", "Appliance Care", "AC repair", "4.8", "Lake View", "8 years", "₹700-1400", "Daily", "verified"],
        ["PR-S003", "Meena Das", "Electrical", "Home Repair", "Wiring", "4.7", "Green Valley", "5 years", "₹450-1000", "Weekends", "verified"],
        ["PR-S004", "Arjun Shah", "Cleaning", "Home Care", "Deep cleaning", "4.9", "West Garden", "7 years", "₹900-1800", "Daily", "verified"],
        ["PR-S005", "Neha Rao", "Painting", "Home Repair", "Interior paint", "4.6", "River Side", "4 years", "₹18-30/sqft", "Weekdays", "pending"],
        ["PR-S006", "Imran Ali", "Plumbing", "Home Repair", "Pipe fitting", "4.8", "Hill Crest", "9 years", "₹550-1100", "Daily", "verified"],
        ["PR-S007", "Kiran Iyer", "AC Service", "Appliance Care", "AC installation", "5.0", "Central Block", "10 years", "₹800-1600", "Weekdays", "verified"],
        ["PR-S008", "Divya Sen", "Electrical", "Home Repair", "Fan repair", "4.5", "Maple Town", "3 years", "₹400-850", "Evenings", "pending"],
        ["PR-S009", "Manoj Paul", "Cleaning", "Home Care", "Kitchen cleaning", "4.7", "South Gate", "6 years", "₹650-1200", "Daily", "verified"],
        ["PR-S010", "Sara Khan", "Painting", "Home Repair", "Wall painting", "4.9", "Oak Residency", "8 years", "₹20-35/sqft", "Weekends", "verified"],
        ["PR-S011", "Vikram Roy", "Plumbing", "Home Repair", "Drain service", "4.6", "Sunrise Colony", "5 years", "₹500-950", "Weekdays", "verified"],
        ["PR-S012", "Anita Bose", "AC Service", "Appliance Care", "AC maintenance", "4.8", "Market Street", "7 years", "₹600-1300", "Daily", "verified"],
        ["PR-S013", "Dev Patel", "Electrical", "Home Repair", "Lighting setup", "4.7", "Park Avenue", "6 years", "₹450-900", "Weekdays", "pending"],
        ["PR-S014", "Latha Menon", "Cleaning", "Home Care", "Move-out clean", "5.0", "Meadow Lane", "9 years", "₹1000-2000", "Weekends", "verified"],
        ["PR-S015", "Nikhil Jain", "Painting", "Home Repair", "Exterior paint", "4.5", "Cedar Square", "4 years", "₹22-38/sqft", "Daily", "verified"],
        ["PR-S016", "Pooja Verma", "Plumbing", "Home Repair", "Tap repair", "4.8", "Bluebell Enclave", "5 years", "₹400-800", "Evenings", "verified"],
    ]

    table_left = 70
    table_top = 164
    row_num_width = table_left
    header_height = 30
    row_height = 39
    draw.rectangle((0, table_top, WIDTH, table_top + header_height), fill="#DDE4EC")
    draw.rectangle((0, table_top, row_num_width, table_top + header_height), fill="#E8EDF4", outline=grid)
    draw.text((24, table_top + 6), "1", fill="#586981", font=FONT_SMALL)
    positions = []
    x = table_left
    for index, (name, width) in enumerate(columns):
        x2 = min(x + width, WIDTH)
        positions.append((x, x2))
        draw.rectangle((x, table_top, x2, table_top + header_height), fill="#E2E8F0", outline=grid)
        draw.text((x + 5, table_top - 23), chr(ord("A") + index), fill="#586981", font=FONT_SMALL)
        draw.text((x + 7, table_top + 6), name, fill="#16233B", font=FONT_LABEL)
        x = x2

    value_font = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 14)
    for row_index, row in enumerate(rows, start=2):
        y1 = table_top + header_height + (row_index - 2) * row_height
        y2 = y1 + row_height
        draw.rectangle((0, y1, row_num_width, y2), fill="#F0F2F5", outline=grid)
        draw.text((26, y1 + 8), str(row_index), fill="#586981", font=FONT_SMALL)
        for (x1, x2), value in zip(positions, row):
            fill = WHITE if row_index % 2 == 0 else "#FBFCFD"
            draw.rectangle((x1, y1, x2, y2), fill=fill, outline=grid)
            text = value
            max_text = x2 - x1 - 12
            while text and draw.textlength(text, font=value_font) > max_text:
                text = text[:-2] + "…"
            draw.text((x1 + 6, y1 + 10), text, fill="#16233B", font=value_font)

    footer_y = table_top + header_height + len(rows) * row_height + 24
    draw.text((78, footer_y), "Columns are based on User and providerProfile fields used by provider listings.", fill="#586981", font=FONT_SMALL)
    draw.text((78, footer_y + 30), "Example results only: GET /api/providers returns provider-role users; the current API does not apply search filters.", fill=green, font=FONT_LABEL)
    save(image, "11-servicehub-provider-discovery-results.png")


def booking_dataset_images():
    def render_sheet(title, columns, rows, filename, note):
        image = Image.new("RGB", (1600, 1000), "#F3F4F6")
        draw = ImageDraw.Draw(image)
        grid = "#D6DAE0"
        green = "#217346"

        draw.rectangle((0, 0, WIDTH, 43), fill="#3C4043")
        draw.text((24, 11), title, fill=WHITE, font=FONT_SMALL)
        draw.text((1215, 11), "SYNTHETIC EXAMPLE DATA", fill="#BDE7CB", font=FONT_LABEL)

        draw.rectangle((0, 43, WIDTH, 92), fill="#F8F9FB")
        x = 25
        for item in ["File", "Home", "Insert", "Data", "Review", "View"]:
            draw.text((x, 59), item, fill="#16233B" if item == "Home" else "#586981", font=FONT_SMALL)
            if item == "Home":
                draw.line((x, 84, x + 43, 84), fill=green, width=3)
            x += 95
        draw.line((0, 92, WIDTH, 92), fill="#C8CDD5", width=2)

        draw.rectangle((0, 94, 70, 130), fill="#F8F9FB", outline=grid)
        draw.text((23, 102), "A1", fill="#16233B", font=FONT_SMALL)
        draw.rectangle((72, 94, WIDTH, 130), fill=WHITE, outline=grid)
        draw.text((92, 102), columns[0][0], fill="#16233B", font=FONT_SMALL)

        table_left = 70
        table_top = 164
        row_num_width = table_left
        header_height = 30
        row_height = 39
        draw.rectangle((0, table_top, WIDTH, table_top + header_height), fill="#DDE4EC")
        draw.rectangle((0, table_top, row_num_width, table_top + header_height), fill="#E8EDF4", outline=grid)
        draw.text((24, table_top + 6), "1", fill="#586981", font=FONT_SMALL)
        positions = []
        x = table_left
        for index, (name, width) in enumerate(columns):
            x2 = min(x + width, WIDTH)
            positions.append((x, x2))
            draw.rectangle((x, table_top, x2, table_top + header_height), fill="#E2E8F0", outline=grid)
            draw.text((x + 5, table_top - 23), chr(ord("A") + index), fill="#586981", font=FONT_SMALL)
            draw.text((x + 7, table_top + 6), name, fill="#16233B", font=FONT_LABEL)
            x = x2

        value_font = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 14)
        for row_index, row in enumerate(rows, start=2):
            y1 = table_top + header_height + (row_index - 2) * row_height
            y2 = y1 + row_height
            draw.rectangle((0, y1, row_num_width, y2), fill="#F0F2F5", outline=grid)
            draw.text((26, y1 + 8), str(row_index), fill="#586981", font=FONT_SMALL)
            for (x1, x2), value in zip(positions, row):
                fill = WHITE if row_index % 2 == 0 else "#FBFCFD"
                draw.rectangle((x1, y1, x2, y2), fill=fill, outline=grid)
                text = value
                max_text = x2 - x1 - 12
                while text and draw.textlength(text, font=value_font) > max_text:
                    text = text[:-2] + "…"
                draw.text((x1 + 6, y1 + 10), text, fill="#16233B", font=value_font)

        footer_y = table_top + header_height + len(rows) * row_height + 24
        draw.text((78, footer_y), "Columns follow fields in the project Booking model.", fill="#586981", font=FONT_SMALL)
        draw.text((78, footer_y + 30), note, fill=green, font=FONT_LABEL)
        save(image, filename)

    booking_columns = [
        ("bookingId", 105),
        ("customerEmail", 160),
        ("providerId", 110),
        ("service", 115),
        ("date", 105),
        ("timeSlot", 115),
        ("address", 155),
        ("amount", 90),
        ("paymentMethod", 140),
    ]
    booking_rows = [
        ["BK-S101", "customer01@example.test", "PR-S001", "Plumbing", "2026-10-20", "09:00-10:00", "North Park", "1200", "UPI"],
        ["BK-S102", "customer02@example.test", "PR-S002", "AC Service", "2026-10-20", "10:00-11:00", "Lake View", "1800", "Card"],
        ["BK-S103", "customer03@example.test", "PR-S003", "Electrical", "2026-10-21", "11:00-12:00", "Green Valley", "950", "UPI"],
        ["BK-S104", "customer04@example.test", "PR-S004", "Cleaning", "2026-10-21", "12:00-13:00", "West Garden", "1500", "Cash"],
        ["BK-S105", "customer05@example.test", "PR-S005", "Painting", "2026-10-22", "13:00-14:00", "River Side", "3200", "Card"],
        ["BK-S106", "customer06@example.test", "PR-S006", "Plumbing", "2026-10-22", "14:00-15:00", "Hill Crest", "850", "UPI"],
        ["BK-S107", "customer07@example.test", "PR-S007", "AC Service", "2026-10-23", "15:00-16:00", "Central Block", "2100", "UPI"],
        ["BK-S108", "customer08@example.test", "PR-S008", "Electrical", "2026-10-23", "09:00-10:00", "Maple Town", "1100", "Cash"],
        ["BK-S109", "customer09@example.test", "PR-S009", "Cleaning", "2026-10-24", "10:00-11:00", "South Gate", "1350", "Card"],
        ["BK-S110", "customer10@example.test", "PR-S010", "Painting", "2026-10-24", "11:00-12:00", "Oak Residency", "4000", "UPI"],
        ["BK-S111", "customer11@example.test", "PR-S011", "Plumbing", "2026-10-25", "12:00-13:00", "Sunrise Colony", "750", "UPI"],
        ["BK-S112", "customer12@example.test", "PR-S012", "AC Service", "2026-10-25", "13:00-14:00", "Market Street", "1900", "Card"],
    ]
    render_sheet(
        "ServiceHub - service booking requests",
        booking_columns,
        booking_rows,
        "12-servicehub-booking-requests.png",
        "Fabricated sample requests only; customer emails, provider IDs, addresses and booking values are not real.",
    )

    result_columns = [
        ("bookingId", 120),
        ("service", 135),
        ("providerId", 125),
        ("status", 190),
        ("escrowStatus", 220),
        ("paymentMethod", 165),
        ("amount", 105),
        ("locationSharing", 160),
        ("result", 220),
    ]
    result_rows = [
        ["BK-S101", "Plumbing", "PR-S001", "CONFIRMED", "HELD_IN_ESCROW", "UPI", "1200", "false", "Booking confirmed"],
        ["BK-S102", "AC Service", "PR-S002", "PROVIDER_EN_ROUTE", "HELD_IN_ESCROW", "Card", "1800", "true", "Provider tracking"],
        ["BK-S103", "Electrical", "PR-S003", "COMPLETED", "RELEASED_TO_PROVIDER", "UPI", "950", "false", "OTP verified"],
        ["BK-S104", "Cleaning", "PR-S004", "CONFIRMED", "HELD_IN_ESCROW", "Cash", "1500", "false", "Booking confirmed"],
        ["BK-S105", "Painting", "PR-S005", "CANCELLED", "REFUNDED", "Card", "3200", "false", "Booking cancelled"],
        ["BK-S106", "Plumbing", "PR-S006", "CONFIRMED", "HELD_IN_ESCROW", "UPI", "850", "false", "Booking confirmed"],
        ["BK-S107", "AC Service", "PR-S007", "PROVIDER_EN_ROUTE", "HELD_IN_ESCROW", "UPI", "2100", "true", "Provider tracking"],
        ["BK-S108", "Electrical", "PR-S008", "COMPLETED", "RELEASED_TO_PROVIDER", "Cash", "1100", "false", "OTP verified"],
        ["BK-S109", "Cleaning", "PR-S009", "CONFIRMED", "DISPUTED", "Card", "1350", "false", "Under dispute"],
        ["BK-S110", "Painting", "PR-S010", "COMPLETED", "RELEASED_TO_PROVIDER", "UPI", "4000", "false", "OTP verified"],
        ["BK-S111", "Plumbing", "PR-S011", "CONFIRMED", "HELD_IN_ESCROW", "UPI", "750", "false", "Booking confirmed"],
        ["BK-S112", "AC Service", "PR-S012", "CANCELLED", "REFUNDED", "Card", "1900", "false", "Booking cancelled"],
    ]
    render_sheet(
        "ServiceHub - booking results",
        result_columns,
        result_rows,
        "13-servicehub-booking-results.png",
        "Fictional result examples; statuses and escrow values illustrate supported booking states, not live transactions.",
    )


def provider_matching_ranking_table():
    image = Image.new("RGB", (1600, 1000), "#F3F4F6")
    draw = ImageDraw.Draw(image)
    grid = "#D6DAE0"
    green = "#217346"

    draw.rectangle((0, 0, 1600, 43), fill="#3C4043")
    draw.text((24, 11), "ServiceHub - provider matching and ranking", fill=WHITE, font=FONT_SMALL)
    draw.text((1215, 11), "SYNTHETIC EXAMPLE DATA", fill="#BDE7CB", font=FONT_LABEL)

    draw.rectangle((0, 43, 1600, 92), fill="#F8F9FB")
    x = 25
    for item in ["File", "Home", "Insert", "Data", "Review", "View"]:
        draw.text((x, 59), item, fill="#16233B" if item == "Home" else "#586981", font=FONT_SMALL)
        if item == "Home":
            draw.line((x, 84, x + 43, 84), fill=green, width=3)
        x += 95
    draw.line((0, 92, 1600, 92), fill="#C8CDD5", width=2)

    draw.rectangle((0, 94, 70, 130), fill="#F8F9FB", outline=grid)
    draw.text((23, 102), "A1", fill="#16233B", font=FONT_SMALL)
    draw.rectangle((72, 94, 1600, 130), fill=WHITE, outline=grid)
    draw.text((92, 102), "rank", fill="#16233B", font=FONT_SMALL)

    columns = [
        ("rank", 70),
        ("providerId", 120),
        ("service", 145),
        ("distanceKm", 125),
        ("rating", 95),
        ("servicePts", 120),
        ("ratingPts", 120),
        ("distancePts", 130),
        ("verificationPts", 155),
        ("matchScore", 145),
    ]
    rows = [
        ["1", "PR-S001", "Plumbing", "1.2", "4.9", "40", "24.5", "20", "15", "99.5"],
        ["2", "PR-S006", "Plumbing", "2.8", "4.8", "40", "24.0", "20", "15", "99.0"],
        ["3", "PR-S011", "Plumbing", "4.1", "4.7", "40", "23.5", "16", "15", "94.5"],
        ["4", "PR-S016", "Plumbing", "6.2", "4.9", "40", "24.5", "12", "15", "91.5"],
        ["5", "PR-S021", "Plumbing", "7.5", "4.5", "40", "22.5", "12", "5", "79.5"],
        ["6", "PR-S022", "Plumbing", "8.3", "4.4", "40", "22.0", "6", "15", "83.0"],
        ["7", "PR-S023", "Plumbing", "10.1", "4.8", "40", "24.0", "6", "15", "85.0"],
        ["8", "PR-S024", "Plumbing", "5.4", "4.2", "40", "21.0", "12", "5", "78.0"],
        ["9", "PR-S025", "Plumbing", "3.6", "4.6", "40", "23.0", "16", "15", "94.0"],
        ["10", "PR-S026", "Plumbing", "9.2", "4.3", "40", "21.5", "6", "15", "82.5"],
        ["11", "PR-S027", "Plumbing", "2.1", "4.1", "40", "20.5", "20", "5", "85.5"],
        ["12", "PR-S028", "Plumbing", "6.8", "4.0", "40", "20.0", "12", "15", "87.0"],
    ]
    # Sort sample rows by their displayed score, highest first.
    rows.sort(key=lambda row: float(row[-1]), reverse=True)
    for rank, row in enumerate(rows, start=1):
        row[0] = str(rank)

    table_left = 70
    table_top = 164
    row_num_width = table_left
    header_height = 30
    row_height = 39
    draw.rectangle((0, table_top, 1600, table_top + header_height), fill="#DDE4EC")
    draw.rectangle((0, table_top, row_num_width, table_top + header_height), fill="#E8EDF4", outline=grid)
    draw.text((24, table_top + 6), "1", fill="#586981", font=FONT_SMALL)
    positions = []
    x = table_left
    for index, (name, width) in enumerate(columns):
        x2 = min(x + width, 1600)
        positions.append((x, x2))
        draw.rectangle((x, table_top, x2, table_top + header_height), fill="#E2E8F0", outline=grid)
        draw.text((x + 5, table_top - 23), chr(ord("A") + index), fill="#586981", font=FONT_SMALL)
        draw.text((x + 7, table_top + 6), name, fill="#16233B", font=FONT_LABEL)
        x = x2

    value_font = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 14)
    for row_index, row in enumerate(rows, start=2):
        y1 = table_top + header_height + (row_index - 2) * row_height
        y2 = y1 + row_height
        draw.rectangle((0, y1, row_num_width, y2), fill="#F0F2F5", outline=grid)
        draw.text((26, y1 + 8), str(row_index), fill="#586981", font=FONT_SMALL)
        for (x1, x2), value in zip(positions, row):
            fill = "#E8F5EC" if row_index == 2 else (WHITE if row_index % 2 == 0 else "#FBFCFD")
            draw.rectangle((x1, y1, x2, y2), fill=fill, outline=grid)
            draw.text((x1 + 6, y1 + 10), value, fill="#16233B", font=value_font)

    footer_y = table_top + header_height + len(rows) * row_height + 24
    draw.text((78, footer_y), "Example request: Plumbing service near a sample customer location. Scores are illustrative, not computed from live provider data.", fill="#586981", font=FONT_SMALL)
    draw.text((78, footer_y + 28), "Example score = service match (40) + rating (rating ÷ 5 × 25) + distance tier (20 / 16 / 12 / 6) + verification (15 verified, 5 pending).", fill=green, font=FONT_SMALL)
    draw.text((78, footer_y + 56), "The current GET /api/providers endpoint does not calculate this score or sort providers by match.", fill=green, font=FONT_LABEL)
    save(image, "14-servicehub-provider-matching-ranking.png")


def matching_input_output_tables():
    def render(title, columns, rows, filename, note):
        image = Image.new("RGB", (1600, 1000), "#F3F4F6")
        draw = ImageDraw.Draw(image)
        grid = "#D6DAE0"
        green = "#217346"
        draw.rectangle((0, 0, 1600, 43), fill="#3C4043")
        draw.text((24, 11), title, fill=WHITE, font=FONT_SMALL)
        draw.text((1215, 11), "SYNTHETIC EXAMPLE DATA", fill="#BDE7CB", font=FONT_LABEL)

        draw.rectangle((0, 43, 1600, 92), fill="#F8F9FB")
        x = 25
        for item in ["File", "Home", "Insert", "Data", "Review", "View"]:
            draw.text((x, 59), item, fill="#16233B" if item == "Home" else "#586981", font=FONT_SMALL)
            if item == "Home":
                draw.line((x, 84, x + 43, 84), fill=green, width=3)
            x += 95
        draw.line((0, 92, 1600, 92), fill="#C8CDD5", width=2)
        draw.rectangle((0, 94, 70, 130), fill="#F8F9FB", outline=grid)
        draw.text((23, 102), "A1", fill="#16233B", font=FONT_SMALL)
        draw.rectangle((72, 94, 1600, 130), fill=WHITE, outline=grid)
        draw.text((92, 102), columns[0][0], fill="#16233B", font=FONT_SMALL)

        table_left, table_top = 70, 164
        header_height, row_height = 30, 39
        draw.rectangle((0, table_top, 1600, table_top + header_height), fill="#DDE4EC")
        draw.rectangle((0, table_top, table_left, table_top + header_height), fill="#E8EDF4", outline=grid)
        draw.text((24, table_top + 6), "1", fill="#586981", font=FONT_SMALL)
        positions = []
        x = table_left
        for index, (name, width) in enumerate(columns):
            x2 = min(x + width, 1600)
            positions.append((x, x2))
            draw.rectangle((x, table_top, x2, table_top + header_height), fill="#E2E8F0", outline=grid)
            draw.text((x + 5, table_top - 23), chr(ord("A") + index), fill="#586981", font=FONT_SMALL)
            draw.text((x + 7, table_top + 6), name, fill="#16233B", font=FONT_LABEL)
            x = x2

        value_font = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 14)
        for row_index, row in enumerate(rows, start=2):
            y1 = table_top + header_height + (row_index - 2) * row_height
            y2 = y1 + row_height
            draw.rectangle((0, y1, table_left, y2), fill="#F0F2F5", outline=grid)
            draw.text((26, y1 + 8), str(row_index), fill="#586981", font=FONT_SMALL)
            for (x1, x2), value in zip(positions, row):
                fill = "#E8F5EC" if row_index == 2 and "output" in filename else (
                    WHITE if row_index % 2 == 0 else "#FBFCFD"
                )
                draw.rectangle((x1, y1, x2, y2), fill=fill, outline=grid)
                text = value
                max_text = x2 - x1 - 12
                while text and draw.textlength(text, font=value_font) > max_text:
                    text = text[:-2] + "…"
                draw.text((x1 + 6, y1 + 10), text, fill="#16233B", font=value_font)

        footer_y = table_top + header_height + len(rows) * row_height + 24
        draw.text((78, footer_y), note, fill="#586981", font=FONT_SMALL)
        draw.text((78, footer_y + 30), "Example data only; no real customer, location or provider records are shown.", fill=green, font=FONT_LABEL)
        save(image, filename)

    input_columns = [
        ("requestId", 115),
        ("serviceCategory", 145),
        ("requestedService", 155),
        ("neighborhood", 145),
        ("bookingDate", 125),
        ("timeSlot", 125),
        ("maxDistanceKm", 135),
        ("minimumRating", 135),
        ("customerLocation", 190),
    ]
    input_rows = [
        ["RQ-S001", "Home Repair", "Plumbing", "North Park", "2026-10-28", "09:00-10:00", "10", "4.0", "North Park"],
        ["RQ-S002", "Appliance Care", "AC Service", "Lake View", "2026-10-28", "10:00-11:00", "12", "4.2", "Lake View"],
        ["RQ-S003", "Home Repair", "Electrical", "Green Valley", "2026-10-29", "11:00-12:00", "10", "4.0", "Green Valley"],
        ["RQ-S004", "Home Care", "Cleaning", "West Garden", "2026-10-29", "12:00-13:00", "8", "4.3", "West Garden"],
        ["RQ-S005", "Home Repair", "Painting", "River Side", "2026-10-30", "13:00-14:00", "15", "4.0", "River Side"],
        ["RQ-S006", "Home Repair", "Plumbing", "Hill Crest", "2026-10-30", "14:00-15:00", "10", "4.1", "Hill Crest"],
        ["RQ-S007", "Appliance Care", "AC Service", "Central Block", "2026-10-31", "15:00-16:00", "12", "4.0", "Central Block"],
        ["RQ-S008", "Home Repair", "Electrical", "Maple Town", "2026-10-31", "09:00-10:00", "10", "4.2", "Maple Town"],
        ["RQ-S009", "Home Care", "Cleaning", "South Gate", "2026-11-01", "10:00-11:00", "8", "4.0", "South Gate"],
        ["RQ-S010", "Home Repair", "Painting", "Oak Residency", "2026-11-01", "11:00-12:00", "15", "4.1", "Oak Residency"],
        ["RQ-S011", "Home Repair", "Plumbing", "Sunrise Colony", "2026-11-02", "12:00-13:00", "10", "4.0", "Sunrise Colony"],
        ["RQ-S012", "Appliance Care", "AC Service", "Market Street", "2026-11-02", "13:00-14:00", "12", "4.3", "Market Street"],
    ]
    render(
        "ServiceHub - provider matching input dataset",
        input_columns,
        input_rows,
        "15-provider-matching-input-dataset.png",
        "Conceptual matching-request fields; filters and customer-location matching are not currently implemented by GET /api/providers.",
    )

    output_columns = [
        ("rank", 70),
        ("requestId", 115),
        ("providerId", 115),
        ("providerName", 145),
        ("matchedService", 145),
        ("distanceKm", 110),
        ("rating", 85),
        ("verificationStatus", 155),
        ("matchScore", 120),
    ]
    output_rows = [
        ["1", "RQ-S001", "PR-S001", "Asha Kumar", "Plumbing", "1.2", "4.9", "verified", "99.5"],
        ["2", "RQ-S001", "PR-S006", "Imran Ali", "Plumbing", "2.8", "4.8", "verified", "99.0"],
        ["3", "RQ-S001", "PR-S025", "Kavita Rao", "Plumbing", "3.6", "4.6", "verified", "94.0"],
        ["4", "RQ-S001", "PR-S011", "Vikram Roy", "Plumbing", "4.1", "4.7", "verified", "94.5"],
        ["5", "RQ-S001", "PR-S016", "Pooja Verma", "Plumbing", "6.2", "4.9", "verified", "91.5"],
        ["6", "RQ-S001", "PR-S028", "Naveen Das", "Plumbing", "6.8", "4.0", "verified", "87.0"],
        ["7", "RQ-S001", "PR-S027", "Suresh Nair", "Plumbing", "2.1", "4.1", "pending", "85.5"],
        ["8", "RQ-S001", "PR-S023", "Hari Menon", "Plumbing", "10.1", "4.8", "verified", "85.0"],
        ["9", "RQ-S001", "PR-S022", "Maya Shah", "Plumbing", "8.3", "4.4", "verified", "83.0"],
        ["10", "RQ-S001", "PR-S026", "Dev Patel", "Plumbing", "9.2", "4.3", "verified", "82.5"],
        ["11", "RQ-S001", "PR-S021", "Rita Bose", "Plumbing", "7.5", "4.5", "pending", "79.5"],
        ["12", "RQ-S001", "PR-S024", "Lakshmi Iyer", "Plumbing", "5.4", "4.2", "pending", "78.0"],
    ]
    output_rows.sort(key=lambda row: float(row[-1]), reverse=True)
    for rank, row in enumerate(output_rows, start=1):
        row[0] = str(rank)
    render(
        "ServiceHub - provider matching output dataset",
        output_columns,
        output_rows,
        "16-provider-matching-output-dataset.png",
        "Illustrative ranked results for request RQ-S001; scores are examples and are not generated by the current API.",
    )


if __name__ == "__main__":
    input_output()
    er_diagram()
    user_profile_database()
    discovery_flow()
    service_result_flow()
    booking_flow()
    input_data_flow()
    output_data_flow()
    dataset_flow()
    dataset_table()
    discovery_results_table()
    booking_dataset_images()
    provider_matching_ranking_table()
    matching_input_output_tables()
