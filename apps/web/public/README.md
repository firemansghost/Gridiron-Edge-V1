# Public Assets

## Brand Images

### Icons & Favicons
- **favicon.svg** - Simple "G" monogram icon for browser tabs
- **icon.svg** - Larger version with rounded corners for app icons (180x180)

### Open Graph / Social Media
- **og.svg** - Social media preview image (1200x630)
  - Used when sharing on Twitter, Facebook, LinkedIn, etc.
  - Shows "GRIDIRON EDGE" wordmark with tagline

### Web App Manifest
- **site.webmanifest** - PWA configuration for "Add to Home Screen"

## Current Implementation

All images are currently **SVG format** for:
- ✅ Crisp rendering at any size
- ✅ Small file size
- ✅ Easy to edit/customize
- ✅ Version control friendly

## Future Enhancements

Consider replacing with raster images for better social media compatibility:

### Recommended Sizes
- `favicon.ico` - 32x32 ICO format (multi-resolution)
- `apple-touch-icon.png` - 180x180 PNG (iOS home screen)
- `og.png` - 1200x630 PNG (Twitter/OG standard)
- `icon-192.png` - 192x192 PNG (Android)
- `icon-512.png` - 512x512 PNG (Android splash)

### Design Notes
- Primary color: `#1e40af` (blue-700)
- Accent color: `#60a5fa` (blue-400)
- Text color: `#ffffff` (white)
- Grid pattern for visual interest

### Tools for Conversion
```bash
# SVG to PNG (using ImageMagick or similar)
convert -background transparent -size 180x180 icon.svg apple-touch-icon.png
convert -background transparent -size 1200x630 og.svg og.png

# Or use online tools:
# - https://svgtopng.com
# - https://cloudconvert.com/svg-to-png
```

## Brand Variations

The header currently uses "Gridiron Edge" but could be A/B tested with:
- "GrayGhost Gridiron"
- Other variations

Update in `apps/web/components/HeaderNav.tsx` to test different branding.

