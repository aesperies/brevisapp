# 🎨 BREVIS Logo - Usage Guide

## Files Included

### In `public/` folder:

1. **logo.svg** (200x200px)
   - Black version
   - For light backgrounds
   - Use on: website, documents, light UI

2. **logo-white.svg** (200x200px)
   - White version
   - For dark backgrounds
   - Use on: dark UI, presentations, social media headers

3. **favicon.svg** (32x32px)
   - Simplified version for browser tab
   - Already linked in index.html

---

## Logo Design

**Style:** Geometric BR monogram
**Inspiration:** Nothing Phone branding
**Format:** SVG (scalable)

### Letter B:
- Vertical stroke on left
- Two curves on right (top smaller, bottom larger)

### Letter R:
- Vertical stroke on left
- Curved top
- Diagonal leg extending bottom-right

---

## How It's Used in the App

### Current Implementation:

The app uses **CSS-based logo** in the HTML (not SVG file).

**Location in code:** `public/index.html` - lines 57-131

**Why CSS?**
- Faster loading (no external file)
- Easier to maintain
- Responds to theme changes
- Consistent rendering

### Logo Components:

```javascript
<div className="logo-mark">
    <span></span>
</div>
```

The CSS creates the BR monogram using:
- `::before` - B vertical stroke
- `::after` - R vertical stroke
- `span` - B curves
- `span::before` - B bottom curve
- `span::after` - R diagonal

---

## When to Use SVG Files

Use the SVG files for:

✅ **Marketing materials**
- Landing page
- Social media
- Blog posts
- Presentations

✅ **Print**
- Business cards
- Letterhead
- Stickers
- Merchandise

✅ **External sites**
- Product Hunt
- GitHub README
- Press kits
- Partner sites

---

## Quick Usage

### For Web:
```html
<img src="/logo.svg" alt="BREVIS" width="48" height="48">
```

### For Dark Backgrounds:
```html
<img src="/logo-white.svg" alt="BREVIS" width="48" height="48">
```

### As Favicon:
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```
*(Already included in index.html)*

---

## Sizes

**Minimum Size:**
- Digital: 32x32px
- Print: 10mm x 10mm

**Recommended:**
- Website header: 48x48px
- Social media: 400x400px
- Print logo: 50mm x 50mm

**Maximum:**
- Unlimited (SVG scales infinitely)

---

## Colors

**Only use:**
- Black (#000000) on light backgrounds
- White (#FFFFFF) on dark backgrounds

**Never:**
- Other colors
- Gradients
- Effects
- Transparency (except PNG)

---

## Spacing

Keep clear space around logo:
- Minimum: Height of one letter
- Recommended: 2x height

**Example:**
If logo is 48px, keep 48-96px clear space around it.

---

## Converting to Other Formats

### Need PNG?
Use online converter: https://svgtopng.com/
- Upload logo.svg or logo-white.svg
- Export at desired size (e.g., 512x512px for social media)

### Need PDF?
Open SVG in Adobe Illustrator or Inkscape
- File → Save As → PDF

### Need EPS?
For professional printing
- Use Illustrator to convert SVG → EPS

---

## Updating the Logo

If you want to modify the logo:

### Option 1: Edit SVG File
- Open in code editor
- Modify paths/strokes
- Save and test

### Option 2: Edit CSS Version
- Open `public/index.html`
- Find `.logo-mark` styles (lines 57-131)
- Adjust positions/sizes
- Refresh browser

**Tip:** CSS version is what users see in the app, so update that one primarily.

---

## Logo on Different Backgrounds

### White Background:
✅ Use logo.svg (black)

### Light Gray (#FAFAFA):
✅ Use logo.svg (black)

### Black Background:
✅ Use logo-white.svg (white)

### Dark Gray (#333):
✅ Use logo-white.svg (white)

### Photos/Gradients:
❌ Avoid - logo needs solid background
✅ Add solid black or white box behind logo

---

## Brand Consistency

Always pair logo with:
- **BREVIS** wordmark (uppercase)
- Inter font family
- Minimal design

Never pair with:
- Decorative fonts
- Colorful graphics
- Cluttered layouts
- Other logos (unless partnership)

---

## Questions?

See full brand guidelines: `BRAND-GUIDELINES.md`

---

**Need custom size or format?**
The SVG files scale to any size without quality loss.
Just specify width/height in your code or export tool.
