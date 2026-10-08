# Generating Extension Icons

## Quick: Omit icons

If generating real icon files is impractical, **omit `icons` and `default_icon` from manifest.json entirely**. Chrome uses a default puzzle-piece icon. This is always better than referencing files that don't exist.

## Generate with Python (Pillow)

```python
# generate_icons.py
from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('icons', exist_ok=True)

for size in [16, 48, 128]:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = max(1, size // 16)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=size // 4,
        fill='#4688F1'
    )
    # Add a letter (load_default(size=...) needs Pillow 10.1+ with FreeType)
    font = ImageFont.load_default(size=size // 2)
    draw.text((size // 2, size // 2), 'E', fill='white', anchor='mm', font=font)
    img.save(f'icons/icon-{size}.png')
    print(f'Created icons/icon-{size}.png ({size}x{size})')
```

## Generate with Node.js (canvas)

```js
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

fs.mkdirSync('icons', { recursive: true });

for (const size of [16, 48, 128]) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size / 4;
  
  // Rounded rectangle
  ctx.beginPath();
  ctx.roundRect(1, 1, size - 2, size - 2, r);
  ctx.fillStyle = '#4688F1';
  ctx.fill();
  
  // Letter
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size / 2}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', size / 2, size / 2);
  
  fs.writeFileSync(`icons/icon-${size}.png`, canvas.toBuffer('image/png'));
  console.log(`Created icons/icon-${size}.png (${size}x${size})`);
}
```

## Draw as SVG, then convert to PNG

Manifest and action icons must be raster files (PNG recommended; BMP, GIF, ICO, and JPEG also
work). Chrome does not support SVG or WebP icons, so convert every SVG before referencing it:

```bash
for SIZE in 16 48 128; do
  cat > "icons/icon-${SIZE}.svg" << EOF
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="$((SIZE/4))" fill="#4688F1"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        fill="white" font-family="sans-serif" font-weight="bold" font-size="$((SIZE/2))">E</text>
</svg>
EOF
  rsvg-convert -w "$SIZE" -h "$SIZE" "icons/icon-${SIZE}.svg" -o "icons/icon-${SIZE}.png"
done
```

`rsvg-convert` ships with librsvg; any SVG rasterizer works. Reference only the `.png` files in
manifest.json.

## Manifest reference

```json
{
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  }
}
```

Each file MUST match its declared size: icon-16.png = 16×16 pixels, etc.
