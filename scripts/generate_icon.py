import math
import os
from PIL import Image, ImageDraw, ImageFilter

def create_institutional_icon(size=1024):
    # Create 32-bit RGBA image
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 1. Base Squircle / Rounded Rectangle
    # Padding around the squircle
    pad = int(size * 0.05)
    r = int(size * 0.22) # Corner radius
    bounds = [pad, pad, size - pad, size - pad]
    
    # Outer dark carbon background with subtle top-to-bottom shading
    # We can draw the squircle mask
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(bounds, radius=r, fill=255)
    
    # Create gradient background
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(size):
        ratio = y / size
        # From #0c101a to #06080d
        red = int(12 * (1 - ratio) + 6 * ratio)
        green = int(16 * (1 - ratio) + 8 * ratio)
        blue = int(26 * (1 - ratio) + 14 * ratio)
        bg_draw.line([(0, y), (size, y)], fill=(red, green, blue, 255))
        
    img.paste(bg, (0, 0), mask)
    
    # 2. Sleek hairline border
    border_draw = ImageDraw.Draw(img)
    border_color = (30, 38, 56, 255) # #1E2638
    border_draw.rounded_rectangle(bounds, radius=r, outline=border_color, width=int(size * 0.012))
    
    # Subtle top highlight rim
    top_rim_bounds = [pad + int(size * 0.01), pad + int(size * 0.01), size - pad - int(size * 0.01), pad + int(size * 0.035)]
    # border_draw.rounded_rectangle(bounds, radius=r, outline=(56, 189, 248, 40), width=int(size * 0.006))
    
    # 3. Geometric Centerpiece: Institutional Ledger Vault & Cryptographic Link
    cx, cy = size // 2, size // 2
    
    # Vault outer hexagon / chamber
    hex_radius = int(size * 0.28)
    points = []
    for i in range(6):
        angle = math.radians(60 * i - 30)
        px = cx + hex_radius * math.cos(angle)
        py = cy + hex_radius * math.sin(angle)
        points.append((px, py))
        
    # Draw dark inner chamber
    draw.polygon(points, fill=(17, 22, 34, 255), outline=(30, 38, 56, 255))
    
    # Inner concentric chamfered chamber
    inner_hex_radius = int(hex_radius * 0.86)
    inner_points = []
    for i in range(6):
        angle = math.radians(60 * i - 30)
        px = cx + inner_hex_radius * math.cos(angle)
        py = cy + inner_hex_radius * math.sin(angle)
        inner_points.append((px, py))
    draw.polygon(inner_points, fill=(10, 13, 20, 255), outline=(56, 189, 248, 120))
    
    # 4. Double-Entry Symmetry: Debit (Cyan) & Credit (Emerald) Interlocking Nodes
    # Left wing: Debit pillar (Electric Cyan #38BDF8)
    # Right wing: Credit pillar (Mint Emerald #10B981)
    line_w = int(size * 0.042)
    wing_w = int(size * 0.12)
    wing_h = int(size * 0.22)
    
    # Left Debit Pillar [DR]
    lx1 = cx - int(size * 0.16)
    lx2 = lx1 + wing_w
    ly1 = cy - wing_h // 2
    ly2 = cy + wing_h // 2
    
    # Draw Left Pillar (Cyan)
    draw.rounded_rectangle([lx1, ly1, lx2, ly2], radius=int(size * 0.02), fill=(16, 26, 46, 255), outline=(56, 189, 248, 255), width=int(size * 0.01))
    # Inner DR slot lines
    for off in [-int(size * 0.04), 0, int(size * 0.04)]:
        draw.line([(lx1 + int(size * 0.025), cy + off), (lx2 - int(size * 0.025), cy + off)], fill=(56, 189, 248, 200), width=int(size * 0.008))
        
    # Right Credit Pillar [CR]
    rx1 = cx + int(size * 0.04)
    rx2 = rx1 + wing_w
    ry1 = cy - wing_h // 2
    ry2 = cy + wing_h // 2
    
    # Draw Right Pillar (Emerald)
    draw.rounded_rectangle([rx1, ry1, rx2, ry2], radius=int(size * 0.02), fill=(12, 34, 28, 255), outline=(16, 185, 129, 255), width=int(size * 0.01))
    # Inner CR slot lines
    for off in [-int(size * 0.04), 0, int(size * 0.04)]:
        draw.line([(rx1 + int(size * 0.025), cy + off), (rx2 - int(size * 0.025), cy + off)], fill=(16, 185, 129, 200), width=int(size * 0.008))

    # 5. Cryptographic SHA-256 Central Bridge / Diamond Node (Linking DR & CR)
    bridge_y = cy
    draw.line([(cx - int(size * 0.06), bridge_y), (cx + int(size * 0.06), bridge_y)], fill=(241, 245, 249, 240), width=int(size * 0.014))
    
    # Central Diamond Hash Node
    dia_r = int(size * 0.045)
    diamond = [
        (cx, cy - dia_r),
        (cx + dia_r, cy),
        (cx, cy + dia_r),
        (cx - dia_r, cy)
    ]
    draw.polygon(diamond, fill=(248, 250, 252, 255), outline=(56, 189, 248, 255))
    
    # Mini core dot
    core_r = int(size * 0.015)
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=(2, 132, 199, 255))

    # 6. Top & Bottom Invariant Balance Markers
    # Equal sign ∑ on top or subtle dots
    dot_r = int(size * 0.012)
    # 3 verification ledger dots on top
    for dx in [-int(size * 0.05), 0, int(size * 0.05)]:
        draw.ellipse([cx + dx - dot_r, cy - int(hex_radius * 0.6) - dot_r, cx + dx + dot_r, cy - int(hex_radius * 0.6) + dot_r], fill=(56, 189, 248, 180))
        
    # 3 verification ledger dots on bottom
    for dx in [-int(size * 0.05), 0, int(size * 0.05)]:
        draw.ellipse([cx + dx - dot_r, cy + int(hex_radius * 0.6) - dot_r, cx + dx + dot_r, cy + int(hex_radius * 0.6) + dot_r], fill=(16, 185, 129, 180))

    return img

def export_ico(source_img, output_ico_path, output_png_path):
    sizes = [256, 128, 64, 48, 32, 16]
    frames = []
    for s in sizes:
        resized = source_img.resize((s, s), Image.Resampling.LANCZOS)
        frames.append(resized)
        
    # Save highest resolution PNG
    source_img.resize((512, 512), Image.Resampling.LANCZOS).save(output_png_path, "PNG")
    
    # Save multi-resolution Windows ICO
    frames[0].save(
        output_ico_path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=frames[1:]
    )
    print(f"Generated ICO: {output_ico_path} with sizes: {sizes}")
    print(f"Generated PNG: {output_png_path}")

if __name__ == "__main__":
    out_dir = r"C:\Users\Kenny\Documents\Projects\core-banking-ledger\scripts"
    ico_path = os.path.join(out_dir, "app-icon.ico")
    png_path = os.path.join(out_dir, "app-icon.png")
    
    img = create_institutional_icon(1024)
    export_ico(img, ico_path, png_path)
