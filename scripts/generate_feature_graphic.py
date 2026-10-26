import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_feature_graphic():
    width, height = 1024, 500
    # RGB image (Google Play requires no transparency for feature graphic)
    img = Image.new("RGB", (width, height), color=(2, 21, 54))
    draw = ImageDraw.Draw(img)

    # 1. Background gradient (dark navy to deep blue)
    for y in range(height):
        factor_y = y / height
        r = int(2 + factor_y * 8)
        g = int(14 + factor_y * 22)
        b = int(36 + factor_y * 55)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # 2. Tech / Radar concentric circles
    center_x = 230
    center_y = 250
    for radius in [100, 160, 230, 310, 400]:
        draw.ellipse(
            [center_x - radius, center_y - radius,
             center_x + radius, center_y + radius],
            outline=(14, 58, 120),
            width=1
        )

    # Subtle radar crosshairs
    draw.line([(center_x - 420, center_y), (center_x + 420, center_y)], fill=(12, 45, 95), width=1)
    draw.line([(center_x, center_y - 250), (center_x, center_y + 250)], fill=(12, 45, 95), width=1)

    # 3. Load transparent Radar Pin icon
    icon_path = os.path.join(os.path.dirname(__file__), "..", "app", "assets", "android-icon-foreground.png")
    if os.path.exists(icon_path):
        icon = Image.open(icon_path).convert("RGBA")
        # Crop tight bounding box
        bbox = icon.getbbox()
        if bbox:
            icon = icon.crop(bbox)
        # Resize to height 290 preserving aspect ratio
        aspect = icon.width / icon.height
        new_h = 290
        new_w = int(new_h * aspect)
        icon_resized = icon.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        # Glow layer
        glow = Image.new("RGBA", (new_w + 60, new_h + 60), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        glow_draw.ellipse([30, 30, new_w + 30, new_h + 30], fill=(9, 235, 251, 40))
        glow = glow.filter(ImageFilter.GaussianBlur(25))
        img.paste(glow, (center_x - (new_w + 60) // 2, center_y - (new_h + 60) // 2), glow)
        
        # Paste icon centered at (center_x, center_y)
        icon_x = center_x - new_w // 2
        icon_y = center_y - new_h // 2
        img.paste(icon_resized, (icon_x, icon_y), icon_resized)

    # 4. Typography
    font_bold = "C:/Windows/Fonts/segoeuib.ttf"
    font_semi = "C:/Windows/Fonts/seguisb.ttf"

    title_font = ImageFont.truetype(font_bold, 66)
    subtitle_font = ImageFont.truetype(font_semi, 28)
    badge_font = ImageFont.truetype(font_semi, 20)

    text_x = 450
    text_y_start = 135

    # Title "Radio Patio"
    draw.text((text_x, text_y_start), "Radio Patio", font=title_font, fill=(255, 255, 255))

    # Accent cyan bar under title
    draw.rounded_rectangle([text_x, text_y_start + 84, text_x + 130, text_y_start + 88], radius=2, fill=(9, 235, 251))

    # Tagline
    draw.text((text_x, text_y_start + 108), "Tu red vecinal en tiempo real", font=subtitle_font, fill=(9, 235, 251))

    # Feature points / badges
    features = [
        "100% Anónima y sin registros",
        "Geometría hexagonal de protección",
        "Avisos comunitarios y servicios urbanos"
    ]

    bullet_y = text_y_start + 168
    for feat in features:
        # Cyan accent pip
        draw.ellipse([text_x, bullet_y + 6, text_x + 8, bullet_y + 14], fill=(31, 123, 248))
        draw.text((text_x + 22, bullet_y), feat, font=badge_font, fill=(203, 213, 225))
        bullet_y += 34

    output_dir = os.path.join(os.path.dirname(__file__), "..", "app", "assets")
    output_path = os.path.join(output_dir, "google-play-feature-graphic.png")
    img.save(output_path, "PNG")
    print(f"Generated feature graphic successfully: {output_path} ({width}x{height})")

if __name__ == "__main__":
    create_feature_graphic()
