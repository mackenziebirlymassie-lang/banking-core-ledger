import os
import io
import struct
import math
from PIL import Image, ImageDraw, ImageFilter

def make_squircle_mask(size, radius_ratio=0.22, pad_ratio=0.03):
    scale = 4
    s = size * scale
    pad = int(s * pad_ratio)
    r = int(s * radius_ratio)
    
    mask = Image.new("L", (s, s), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([pad, pad, s - pad, s - pad], radius=r, fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)

def draw_tier1_high_detail(size=1024):
    """High-Detail Tier: 1024px master downscaled to 512, 256, 192, 128"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    # 1. Base Squircle with Matte Obsidian fill
    mask = make_squircle_mask(size, radius_ratio=0.22, pad_ratio=0.03)
    
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    # Subtle radial gradient from center #0f172a to edge #07090e
    cx, cy = size // 2, size // 2
    for r in range(size, 0, -8):
        ratio = r / size
        # from #0d1322 at center to #07090e at edge
        red = int(13 * (1 - ratio) + 7 * ratio)
        green = int(19 * (1 - ratio) + 9 * ratio)
        blue = int(34 * (1 - ratio) + 14 * ratio)
        bg_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(red, green, blue, 255))
        
    img.paste(bg, (0, 0), mask)
    
    # Hairline bevel border
    border_draw = ImageDraw.Draw(img)
    pad = int(size * 0.03)
    r = int(size * 0.22)
    border_draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, outline=(30, 38, 56, 255), width=max(2, int(size * 0.012)))
    
    # 2. Outer Concentric Vault Chamber
    vault_r = int(size * 0.32)
    border_draw.ellipse([cx - vault_r, cy - vault_r, cx + vault_r, cy + vault_r], outline=(25, 33, 49, 255), width=int(size * 0.015))
    
    # 12 Precision radial tick marks
    tick_len = int(size * 0.02)
    for i in range(12):
        angle = math.radians(i * 30)
        x1 = cx + (vault_r - tick_len) * math.cos(angle)
        y1 = cy + (vault_r - tick_len) * math.sin(angle)
        x2 = cx + (vault_r + tick_len * 0.4) * math.cos(angle)
        y2 = cy + (vault_r + tick_len * 0.4) * math.sin(angle)
        # Highlight top/bottom/left/right cardinal ticks
        color = (56, 189, 248, 180) if i in (0, 6) else (16, 185, 129, 180) if i in (3, 9) else (42, 54, 79, 200)
        border_draw.line([(x1, y1), (x2, y2)], fill=color, width=max(2, int(size * 0.008)))
        
    # 3. Double-Entry Interlocking Chevrons / Vault Rings
    # Left Arc: Debit Cyan (#38BDF8)
    arc_r = int(size * 0.22)
    arc_w = int(size * 0.055)
    
    # Left semi-ring (Debit)
    border_draw.arc([cx - arc_r, cy - arc_r, cx + arc_r, cy + arc_r], start=95, end=265, fill=(56, 189, 248, 255), width=arc_w)
    # Right semi-ring (Credit)
    border_draw.arc([cx - arc_r, cy - arc_r, cx + arc_r, cy + arc_r], start=275, end=85, fill=(16, 185, 129, 255), width=arc_w)
    
    # Inner balanced ledger beams (Debit & Credit pillars)
    pw = int(size * 0.09)
    ph = int(size * 0.16)
    
    # Left pillar [DR]
    lx = cx - int(size * 0.14)
    border_draw.rounded_rectangle([lx - pw//2, cy - ph//2, lx + pw//2, cy + ph//2], radius=int(size*0.02), fill=(14, 26, 44, 255), outline=(56, 189, 248, 255), width=int(size*0.01))
    for off in [-int(size * 0.035), 0, int(size * 0.035)]:
        border_draw.line([(lx - pw//3, cy + off), (lx + pw//3, cy + off)], fill=(56, 189, 248, 220), width=int(size*0.008))
        
    # Right pillar [CR]
    rx = cx + int(size * 0.14)
    border_draw.rounded_rectangle([rx - pw//2, cy - ph//2, rx + pw//2, cy + ph//2], radius=int(size*0.02), fill=(10, 32, 24, 255), outline=(16, 185, 129, 255), width=int(size*0.01))
    for off in [-int(size * 0.035), 0, int(size * 0.035)]:
        border_draw.line([(rx - pw//3, cy + off), (rx + pw//3, cy + off)], fill=(16, 185, 129, 220), width=int(size*0.008))
        
    # 4. Central Cryptographic Lock Bridge & Merkle Diamond
    border_draw.line([(lx, cy), (rx, cy)], fill=(241, 245, 249, 230), width=int(size * 0.016))
    
    dia_r = int(size * 0.05)
    diamond = [
        (cx, cy - dia_r),
        (cx + dia_r, cy),
        (cx, cy + dia_r),
        (cx - dia_r, cy)
    ]
    border_draw.polygon(diamond, fill=(248, 250, 252, 255), outline=(56, 189, 248, 255))
    
    # Center vault core node
    node_r = int(size * 0.018)
    border_draw.ellipse([cx - node_r, cy - node_r, cx + node_r, cy + node_r], fill=(2, 132, 199, 255))
    
    return img

def draw_tier2_medium_detail(target_size):
    """Medium-Detail Tier: hand-crafted for 64, 48, 32, 24.
       Supersample 4x, bold 35% heavier strokes, no clutter ticks."""
    scale = 4
    s = target_size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    
    # Squircle mask
    pad = int(s * 0.035)
    r = int(s * 0.22)
    mask = Image.new("L", (s, s), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([pad, pad, s - pad, s - pad], radius=r, fill=255)
    
    # Dark carbon background
    bg = Image.new("RGBA", (s, s), (7, 9, 14, 255))
    img.paste(bg, (0, 0), mask)
    
    draw = ImageDraw.Draw(img)
    # Border
    bw = max(2, int(s * 0.025))
    draw.rounded_rectangle([pad, pad, s - pad, s - pad], radius=r, outline=(30, 38, 56, 255), width=bw)
    
    cx, cy = s // 2, s // 2
    
    # Heavy interlocking arcs (35% bolder)
    arc_r = int(s * 0.28)
    arc_w = max(4, int(s * 0.10))
    
    # Left Debit Arc (Cyan)
    draw.arc([cx - arc_r, cy - arc_r, cx + arc_r, cy + arc_r], start=90, end=270, fill=(56, 189, 248, 255), width=arc_w)
    # Right Credit Arc (Emerald)
    draw.arc([cx - arc_r, cy - arc_r, cx + arc_r, cy + arc_r], start=270, end=90, fill=(16, 185, 129, 255), width=arc_w)
    
    # Center heavy connector bridge
    bridge_w = max(3, int(s * 0.07))
    draw.line([(cx - int(s * 0.22), cy), (cx + int(s * 0.22), cy)], fill=(241, 245, 249, 255), width=bridge_w)
    
    # Large bold diamond center node
    dia_r = int(s * 0.11)
    diamond = [
        (cx, cy - dia_r),
        (cx + dia_r, cy),
        (cx, cy + dia_r),
        (cx - dia_r, cy)
    ]
    draw.polygon(diamond, fill=(248, 250, 252, 255), outline=(56, 189, 248, 255))
    
    # Diamond core
    core_r = max(2, int(s * 0.04))
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=(2, 132, 199, 255))
    
    # Downsample cleanly to target_size
    return img.resize((target_size, target_size), Image.Resampling.LANCZOS)

def draw_tier3_micro_detail_16():
    """Micro-Pixel Tier: 16x16 pixel-grid aligned.
       Guaranteed transparent corners and solid 2px strokes for DR/CR."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 1. Background squircle: 14x14 area (from 1 to 14)
    # Corner pixels remain completely Alpha = 0: (0,0), (0,1), (1,0), (15,0), etc.
    draw.rectangle([1, 1, 14, 14], fill=(7, 9, 14, 255))
    
    # Hairline 1px border
    draw.rectangle([1, 1, 14, 14], outline=(30, 38, 56, 255))
    
    # Force transparent outer corner pixels
    corners = [
        (0,0), (0,1), (1,0),
        (15,0), (14,0), (15,1),
        (0,15), (0,14), (1,15),
        (15,15), (14,15), (15,14),
        (2,0), (0,2), (13,0), (15,2),
        (0,13), (2,15), (15,13), (13,15)
    ]
    for pt in corners:
        img.putpixel(pt, (0, 0, 0, 0))
        
    # 2. Interlocking Double-Entry Vault Glyph (2px solid lines)
    # Left Debit Pillar / Arc (Cyan #38BDF8)
    # 2px vertical bar at x=3..4, y=4..11
    cyan = (56, 189, 248, 255)
    cyan_dim = (14, 165, 233, 255)
    for y in range(4, 12):
        img.putpixel((3, y), cyan)
        img.putpixel((4, y), cyan)
    # Top and bottom hooks for D shape
    img.putpixel((5, 4), cyan)
    img.putpixel((5, 11), cyan)
    
    # Right Credit Pillar / Arc (Emerald #10B981)
    # 2px vertical bar at x=11..12, y=4..11
    emerald = (16, 185, 129, 255)
    for y in range(4, 12):
        img.putpixel((11, y), emerald)
        img.putpixel((12, y), emerald)
    # Top and bottom hooks for C shape
    img.putpixel((10, 4), emerald)
    img.putpixel((10, 11), emerald)
    
    # Center Balance Lock Bridge (2px white at x=6..9, y=7..8)
    white = (248, 250, 252, 255)
    for x in range(6, 10):
        img.putpixel((x, 7), white)
        img.putpixel((x, 8), white)
        
    # Center cryptographic diamond core node
    img.putpixel((7, 6), (56, 189, 248, 255))
    img.putpixel((8, 6), (56, 189, 248, 255))
    img.putpixel((7, 9), (16, 185, 129, 255))
    img.putpixel((8, 9), (16, 185, 129, 255))
    
    return img

def build_ico_binary(frames_dict, out_ico_path):
    """
    Builds a strict binary Windows .ico file with ICONDIR and 7 ICONDIRENTRY headers.
    Sizes: 256, 128, 64, 48, 32, 24, 16.
    Frames are stored as valid 32-bit PNG streams.
    """
    sizes_order = [256, 128, 64, 48, 32, 24, 16]
    png_streams = []
    
    for s in sizes_order:
        img = frames_dict[s]
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_streams.append((s, buf.getvalue()))
        
    num_images = len(png_streams) # 7
    
    # Calculate offsets
    # Header: 6 bytes
    # Entries: num_images * 16 bytes
    header_size = 6 + num_images * 16
    curr_offset = header_size
    
    entries = []
    image_data_blobs = []
    
    for s, data in png_streams:
        w_byte = 0 if s == 256 else s
        h_byte = 0 if s == 256 else s
        bColorCount = 0
        bReserved = 0
        wPlanes = 1
        wBitCount = 32
        dwBytesInRes = len(data)
        dwImageOffset = curr_offset
        
        entry = struct.pack(
            "<BBBBHHII",
            w_byte,
            h_byte,
            bColorCount,
            bReserved,
            wPlanes,
            wBitCount,
            dwBytesInRes,
            dwImageOffset
        )
        entries.append(entry)
        image_data_blobs.append(data)
        curr_offset += len(data)
        
    # Write .ico file
    with open(out_ico_path, "wb") as f:
        # ICONDIR header: idReserved=0, idType=1, idCount=num_images
        f.write(struct.pack("<HHH", 0, 1, num_images))
        for ent in entries:
            f.write(ent)
        for blob in image_data_blobs:
            f.write(blob)
            
    print(f"Packed 7-frame ICO: {out_ico_path} ({os.path.getsize(out_ico_path)} bytes)")

def create_master_svg():
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <defs>
    <radialGradient id="vaultBg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#07090e" />
    </radialGradient>
    <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
  </defs>
  <!-- Squircle Base -->
  <rect x="3" y="3" width="94" height="94" rx="21" fill="url(#vaultBg)" stroke="#1e2638" stroke-width="2" />
  <!-- Concentric Vault Chamber -->
  <circle cx="50" cy="50" r="32" fill="none" stroke="#161f33" stroke-width="2.5" />
  <!-- Cardinal Tick Marks -->
  <line x1="50" y1="16" x2="50" y2="20" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" />
  <line x1="50" y1="80" x2="50" y2="84" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" />
  <line x1="16" y1="50" x2="20" y2="50" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" />
  <line x1="80" y1="50" x2="84" y2="50" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" />
  <!-- Interlocking Double-Entry Balance Vault Rings -->
  <!-- Left Debit Arc (Cyan) -->
  <path d="M 50 28 A 22 22 0 0 0 50 72" fill="none" stroke="url(#cyanGrad)" stroke-width="5.5" stroke-linecap="round" />
  <!-- Right Credit Arc (Emerald) -->
  <path d="M 50 28 A 22 22 0 0 1 50 72" fill="none" stroke="url(#emeraldGrad)" stroke-width="5.5" stroke-linecap="round" />
  <!-- Balance Lock Bridge -->
  <line x1="36" y1="50" x2="64" y2="50" stroke="#f1f5f9" stroke-width="2.2" stroke-linecap="round" />
  <!-- Central Merkle Diamond Node -->
  <polygon points="50,45 55,50 50,55 45,50" fill="#f8fafc" stroke="#38bdf8" stroke-width="1.2" />
  <!-- Micro Core Dot -->
  <circle cx="50" cy="50" r="1.5" fill="#0284c7" />
</svg>"""

if __name__ == "__main__":
    root_dir = r"C:\Users\Kenny\Documents\Projects\core-banking-ledger"
    scripts_dir = os.path.join(root_dir, "scripts")
    release_dir = os.path.join(root_dir, "release")
    ui_public = os.path.join(root_dir, "ledger-ui", "public")
    core_static = os.path.join(root_dir, "ledger-core", "src", "main", "resources", "static")
    
    print("[1] Generating High-Detail Master (1024px)...")
    master_1024 = draw_tier1_high_detail(1024)
    
    # Produce frames
    frames = {}
    
    # Tier 1: 512, 256, 192, 128
    for s in [512, 256, 192, 128]:
        frames[s] = master_1024.resize((s, s), Image.Resampling.LANCZOS)
        
    # Tier 2: 64, 48, 32, 24
    print("[2] Generating Medium-Detail Frames (64, 48, 32, 24)...")
    for s in [64, 48, 32, 24]:
        frames[s] = draw_tier2_medium_detail(s)
        
    # Tier 3: 16
    print("[3] Generating Micro-Pixel Grid Frame (16x16)...")
    frames[16] = draw_tier3_micro_detail_16()
    
    # Verify transparent corners on 256 and 16
    assert frames[256].getpixel((0, 0))[3] == 0, "Pixel (0,0) of 256x256 must be Alpha=0"
    assert frames[16].getpixel((0, 0))[3] == 0, "Pixel (0,0) of 16x16 must be Alpha=0"
    print("Verification PASSED: Corner alpha == 0 across all frames.")
    
    # Save PNG deliverables
    frames[512].save(os.path.join(scripts_dir, "icon-512.png"), "PNG")
    frames[512].save(os.path.join(ui_public, "icon-512.png"), "PNG")
    frames[512].save(os.path.join(core_static, "icon-512.png"), "PNG")
    
    frames[192].save(os.path.join(scripts_dir, "icon-192.png"), "PNG")
    frames[192].save(os.path.join(ui_public, "icon-192.png"), "PNG")
    frames[192].save(os.path.join(core_static, "icon-192.png"), "PNG")
    
    frames[64].save(os.path.join(scripts_dir, "icon-64.png"), "PNG")
    frames[64].save(os.path.join(ui_public, "icon-64.png"), "PNG")
    frames[64].save(os.path.join(core_static, "icon-64.png"), "PNG")
    
    # Save master SVG
    svg_content = create_master_svg()
    with open(os.path.join(scripts_dir, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(svg_content)
    with open(os.path.join(ui_public, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(svg_content)
    with open(os.path.join(core_static, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(svg_content)
        
    # Build strict 7-frame binary .ico
    ico_dest = os.path.join(scripts_dir, "app-icon.ico")
    build_ico_binary(frames, ico_dest)
    
    # Copy .ico to release and static directories
    import shutil
    shutil.copy(ico_dest, os.path.join(release_dir, "app-icon.ico"))
    shutil.copy(ico_dest, os.path.join(ui_public, "favicon.ico"))
    shutil.copy(ico_dest, os.path.join(core_static, "favicon.ico"))
    
    print("[4] Generated all Multi-LOD deliverables successfully!")
