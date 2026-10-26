import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SOURCE_PATH = r'C:\Users\marti\.gemini\antigravity-ide\brain\53497008-f588-45e6-99e8-f3dfb7775ddd\logo_concept_radar_pin_1793008650077.jpg'
BASE_DIR = r'c:\Users\marti\Downloads\radio-patio'

# 1. Clean up test symbol if present
test_path = os.path.join(BASE_DIR, 'landing', 'assets', 'test_symbol.png')
if os.path.exists(test_path):
    os.remove(test_path)

# 2. Load source image
src = Image.open(SOURCE_PATH)
arr = np.array(src).astype(float)
bg = np.array([2.0, 21.0, 54.0]) # dark navy in tile

# Compute alpha mask for symbol
diff = np.linalg.norm(arr - bg, axis=2)
alpha = np.clip((diff - 16) / 32.0, 0, 1)
white_outer = arr[:, :, 0] > 180
alpha[white_outer] = 0

rgba = np.zeros((1024, 1024, 4), dtype=np.uint8)
rgba[:, :, :3] = np.array(src)
rgba[:, :, 3] = (alpha * 255).astype(np.uint8)

# Crop the symbol bounds (tight crop around the pin and waves)
# Symbol is at x=[192, 830], y=[204, 819]
raw_symbol = Image.fromarray(rgba).crop((190, 200, 832, 822))

# Background color for app & brand
NAVY_BG = (2, 21, 54, 255) # #021536

def create_badge_icon(size, symbol_ratio=0.74, bg_color=NAVY_BG, rounded=False, radius_ratio=0.22):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0) if rounded else bg_color)
    if rounded:
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        r = int(size * radius_ratio)
        draw.rounded_rectangle((0, 0, size, size), radius=r, fill=255)
        bg_img = Image.new('RGBA', (size, size), bg_color)
        canvas.paste(bg_img, (0, 0), mask)
    
    # Scale symbol preserving aspect ratio
    sym_w, sym_h = raw_symbol.size
    aspect = sym_w / sym_h
    target_h = int(size * symbol_ratio)
    target_w = int(target_h * aspect)
    if target_w > int(size * symbol_ratio):
        target_w = int(size * symbol_ratio)
        target_h = int(target_w / aspect)
    
    scaled_sym = raw_symbol.resize((target_w, target_h), Image.Resampling.LANCZOS)
    pos_x = (size - target_w) // 2
    pos_y = (size - target_h) // 2
    canvas.paste(scaled_sym, (pos_x, pos_y), scaled_sym)
    return canvas

def create_monochrome_icon(size, symbol_ratio=0.62):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    # Make pure white version of symbol
    sym_arr = np.array(raw_symbol)
    mono_arr = np.zeros_like(sym_arr)
    mono_arr[:, :, :3] = 255 # pure white
    mono_arr[:, :, 3] = sym_arr[:, :, 3] # keep alpha
    mono_sym = Image.fromarray(mono_arr)
    
    sym_w, sym_h = mono_sym.size
    aspect = sym_w / sym_h
    target_h = int(size * symbol_ratio)
    target_w = int(target_h * aspect)
    scaled_sym = mono_sym.resize((target_w, target_h), Image.Resampling.LANCZOS)
    pos_x = (size - target_w) // 2
    pos_y = (size - target_h) // 2
    canvas.paste(scaled_sym, (pos_x, pos_y), scaled_sym)
    return canvas

def create_transparent_foreground(size, symbol_ratio=0.64):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sym_w, sym_h = raw_symbol.size
    aspect = sym_w / sym_h
    target_h = int(size * symbol_ratio)
    target_w = int(target_h * aspect)
    scaled_sym = raw_symbol.resize((target_w, target_h), Image.Resampling.LANCZOS)
    pos_x = (size - target_w) // 2
    pos_y = (size - target_h) // 2
    canvas.paste(scaled_sym, (pos_x, pos_y), scaled_sym)
    return canvas

# 1. Landing brand logo (512x512)
logo_img = create_badge_icon(512, symbol_ratio=0.75, bg_color=NAVY_BG, rounded=False)
logo_path = os.path.join(BASE_DIR, 'landing', 'assets', 'radio-patio-logo.png')
logo_img.save(logo_path, 'PNG', optimize=True)
print(f'Saved: {logo_path}')

# 2. Landing favicon (48x48 and 32x32) with high fill ratio (88%) for maximum legibility at small sizes
fav_48 = create_badge_icon(48, symbol_ratio=0.88, bg_color=NAVY_BG, rounded=True, radius_ratio=0.22)
fav_path = os.path.join(BASE_DIR, 'landing', 'favicon.png')
fav_48.save(fav_path, 'PNG', optimize=True)
print(f'Saved: {fav_path}')

fav_32 = create_badge_icon(32, symbol_ratio=0.88, bg_color=NAVY_BG, rounded=True, radius_ratio=0.22)
fav32_path = os.path.join(BASE_DIR, 'landing', 'favicon-32.png')
fav_32.save(fav32_path, 'PNG', optimize=True)
print(f'Saved: {fav32_path}')

# 3. App icon.png (1024x1024)
app_icon = create_badge_icon(1024, symbol_ratio=0.74, bg_color=NAVY_BG, rounded=False)
app_icon_path = os.path.join(BASE_DIR, 'app', 'assets', 'icon.png')
app_icon.save(app_icon_path, 'PNG', optimize=True)
print(f'Saved: {app_icon_path}')

# 4. App android-icon-foreground.png (512x512 transparent inside 66% safe area)
fg_icon = create_transparent_foreground(512, symbol_ratio=0.64)
fg_path = os.path.join(BASE_DIR, 'app', 'assets', 'android-icon-foreground.png')
fg_icon.save(fg_path, 'PNG', optimize=True)
print(f'Saved: {fg_path}')

# 5. App android-icon-background.png (512x512 solid navy)
bg_img = Image.new('RGB', (512, 512), (2, 21, 54))
bg_path = os.path.join(BASE_DIR, 'app', 'assets', 'android-icon-background.png')
bg_img.save(bg_path, 'PNG', optimize=True)
print(f'Saved: {bg_path}')

# 6. App android-icon-monochrome.png (432x432 white transparent)
mono_icon = create_monochrome_icon(432, symbol_ratio=0.62)
mono_path = os.path.join(BASE_DIR, 'app', 'assets', 'android-icon-monochrome.png')
mono_icon.save(mono_path, 'PNG', optimize=True)
print(f'Saved: {mono_path}')

# 7. App splash-icon.png (1024x1024 transparent)
splash_icon = create_transparent_foreground(1024, symbol_ratio=0.48)
splash_path = os.path.join(BASE_DIR, 'app', 'assets', 'splash-icon.png')
splash_icon.save(splash_path, 'PNG', optimize=True)
print(f'Saved: {splash_path}')

print('All Radar Pin brand assets generated successfully!')
