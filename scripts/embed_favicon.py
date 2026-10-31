import base64
import io
import os
import shutil
from PIL import Image

def main():
    root = r"C:\Users\Kenny\Documents\Projects\core-banking-ledger"
    ico_src = os.path.join(root, "scripts", "icon-v2.ico")
    png_src = os.path.join(root, "scripts", "icon-v2.png")
    
    # Copy to release
    shutil.copy(ico_src, os.path.join(root, "release", "app-icon.ico"))
    
    # Copy to public
    shutil.copy(ico_src, os.path.join(root, "ledger-ui", "public", "favicon.ico"))
    shutil.copy(png_src, os.path.join(root, "ledger-ui", "public", "app-icon.png"))
    
    # Generate 32x32 base64 PNG
    img = Image.open(png_src)
    resized = img.resize((32, 32), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    data_uri = f"data:image/png;base64,{b64}"
    
    html_path = os.path.join(root, "ledger-ui", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
        
    tag = f'<link rel="icon" type="image/png" href="{data_uri}" />'
    if '<link rel="icon"' not in html:
        target = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
        html = html.replace(target, target + "\n    " + tag)
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
        print("Embedded favicon into ledger-ui/index.html")
    else:
        print("Favicon already present in ledger-ui/index.html")

if __name__ == "__main__":
    main()
