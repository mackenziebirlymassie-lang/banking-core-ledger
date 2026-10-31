import os
from PIL import Image, ImageDraw, ImageFilter

def make_squircle_mask(size, radius_ratio=0.22, pad_ratio=0.03):
    # Create high-res mask for antialiased squircle
    scale = 4
    s = size * scale
    pad = int(s * pad_ratio)
    r = int(s * radius_ratio)
    
    mask = Image.new("L", (s, s), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([pad, pad, s - pad, s - pad], radius=r, fill=255)
    
    # Downscale for smooth antialiased edges
    return mask.resize((size, size), Image.Resampling.LANCZOS)

def process_ai_image(jpg_path, out_ico_path, out_png_path):
    orig = Image.open(jpg_path).convert("RGB")
    w, h = orig.size
    
    # Square crop if needed
    dim = min(w, h)
    left = (w - dim) // 2
    top = (h - dim) // 2
    cropped = orig.crop((left, top, left + dim, top + dim))
    
    # Resize to 1024x1024
    base = cropped.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # Create RGBA with squircle alpha mask
    mask = make_squircle_mask(1024, radius_ratio=0.22, pad_ratio=0.04)
    
    rgba = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    rgba.paste(base, (0, 0))
    rgba.putalpha(mask)
    
    # Add subtle hairline dark border to ensure clean contrast on bright backgrounds
    border_draw = ImageDraw.Draw(rgba)
    pad = int(1024 * 0.04)
    r = int(1024 * 0.22)
    border_draw.rounded_rectangle([pad, pad, 1024 - pad, 1024 - pad], radius=r, outline=(30, 38, 56, 255), width=8)
    
    # Export multi-resolution ICO (256, 128, 64, 48, 32, 16)
    sizes = [256, 128, 64, 48, 32, 16]
    frames = []
    for s in sizes:
        resized = rgba.resize((s, s), Image.Resampling.LANCZOS)
        frames.append(resized)
        
    rgba.resize((512, 512), Image.Resampling.LANCZOS).save(out_png_path, "PNG")
    
    frames[0].save(
        out_ico_path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=frames[1:]
    )
    print(f"Exported {out_ico_path} & {out_png_path}")

if __name__ == "__main__":
    brain_dir = r"C:\Users\Kenny\.gemini\antigravity-cli\brain\cb83e676-4389-4a62-b3ba-61cd03143b13"
    scripts_dir = r"C:\Users\Kenny\Documents\Projects\core-banking-ledger\scripts"
    
    v2_jpg = os.path.join(brain_dir, "core_banking_ledger_icon_v2_1793414106926.jpg")
    v3_jpg = os.path.join(brain_dir, "core_banking_ledger_icon_v3_1793414124495.jpg")
    
    process_ai_image(v2_jpg, os.path.join(scripts_dir, "icon-v2.ico"), os.path.join(scripts_dir, "icon-v2.png"))
    process_ai_image(v3_jpg, os.path.join(scripts_dir, "icon-v3.ico"), os.path.join(scripts_dir, "icon-v3.png"))
