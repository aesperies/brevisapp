# Brevis Brand Voice & Design Guidelines

> Extracted from the live brevisapp.com codebase (index.html, SVGs, app.html) — April 8, 2026.
> This is the canonical reference for all new pages.

---

## 1. Color Palette

### CSS Variables (copy exactly)
```css
:root {
    --primary: #000000;
    --accent: #26C6DA;
    --accent-light: #e8f9fa;
    --accent-dark: #1a9499;
    --bg: #F9F8F5;
    --text: #0a0a0a;
    --text-secondary: #555555;
    --text-tertiary: #888888;
    --border: #E8E8E8;
    --surface: #F0EFE9;
}
```

### Usage Rules
- **Page background**: Always `var(--bg)` (#F9F8F5) — warm cream, NEVER dark
- **Alternating sections**: Switch between `var(--bg)` and `var(--surface)` (#F0EFE9) with `border-top: 1px solid var(--border)`
- **Pricing section**: ONLY section with dark bg (`var(--primary)` / black). White text, teal accents.
- **Footer**: `var(--primary)` background (black), white text
- **SVG icon accent**: `#2BBCC0` (slightly warmer than CSS accent — use in SVG contexts)
- **Teal gradient overlays**: `rgba(38,198,218,0.13)` for hero, `rgba(43,188,192,0.10)` for CTA

### Color DO NOTs
- Never use dark/navy backgrounds (#1a1a2e) for content sections
- Never use blue (#4361ee) — always teal (#26C6DA)
- Never use pure white (#FFFFFF) as page background — use #F9F8F5

---

## 2. Typography

### Font Import (exact Google Fonts URL)
```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital,wght@0,400;0,600;1,400&family=Fraunces:ital,opsz,wght@1,9..144,400;1,9..144,600;1,9..144,700&display=swap" rel="stylesheet">
```

### Font Roles
| Role | Font | Weight | Size | Notes |
|------|------|--------|------|-------|
| Body text | Instrument Sans | 400-500 | 15-17px | line-height: 1.5-1.6, color: var(--text-secondary) |
| Nav links | Instrument Sans | 500 | 15px | color: var(--text-secondary) |
| Buttons | Instrument Sans | 600 | 14-15px | — |
| Section labels | Instrument Sans | 700 | 12px | UPPERCASE, letter-spacing: 0.12em, color: var(--accent) |
| H1 (hero) | Instrument Serif | 600 | 64px (desktop) / 36px (mobile) | letter-spacing: -0.02em |
| H2 (section titles) | Instrument Serif | 600 | 40-48px (desktop) / 30-34px (mobile) | letter-spacing: -0.03em |
| Pricing values | Instrument Serif | 600 | 44px | letter-spacing: -0.03em |
| Footer brand | Instrument Serif | 600 | 22px | letter-spacing: -0.03em, white |
| Italic accent in headings | Fraunces | italic 600 | inherit from parent | color: var(--accent), letter-spacing: -0.03em |
| Logo wordmark | Instrument Sans | 400 | 32px (SVG) | letter-spacing: 0.08em, NOT bold |

### Typography DO NOTs
- Never use Inter, Roboto, or system fonts as primary
- Never bold the logo wordmark (it's weight 400)
- Never use Fraunces for body text — only for italic accent words in headings

---

## 3. Logo

### Files
- **Full logo (nav)**: `/logo-v2-3-light.svg` — 220x60, papers icon + "BREVIS" wordmark
- **Small logo**: `/logo-sm.svg` — 120x40 variant
- **Favicon**: `/favicon.svg` — 32x32, papers icon only
- **Apple touch**: `/apple-touch-icon.png`

### Logo Mark
Three fanned papers: back (#E5E5E5, rotated -8°), middle (#CCCCCC), front (#2BBCC0, rotated 8°). Arrow icon on center paper.

### Nav Logo Implementation
```html
<a href="/" class="logo">
    <img src="/logo-v2-3-light.svg" alt="BREVIS">
</a>
```
Logo container: height 36px, `object-fit: contain`.

---

## 4. Navigation

### Structure
```html
<nav>
    <div class="nav-container">
        <a href="/" class="logo"><img src="/logo-v2-3-light.svg" alt="BREVIS"></a>
        <div class="nav-links">
            <!-- Page-specific links here -->
        </div>
        <div class="nav-right">
            <!-- Optional: Language toggle (ES|EN) -->
            <a href="/app.html" class="btn-ghost">Log in</a>
            <a href="/app.html" class="btn btn-primary">Try for free</a>
        </div>
    </div>
</nav>
```

### Styles
- **Fixed**, top, z-index 1000
- Background: `rgba(249, 248, 245, 0.95)` with `backdrop-filter: blur(20px)`
- Border-bottom: `1px solid var(--border)`
- Container: max-width 1200px, height 60px, flex space-between
- Links: 15px, weight 500, color var(--text-secondary), gap 28px

### Language Toggle (bilingual pages)
```html
<div class="lang-toggle">
    <button class="lang-toggle-btn active" data-lang="es" onclick="switchLang('es')"><span>ES</span></button>
    <span class="lang-toggle-separator">|</span>
    <button class="lang-toggle-btn inactive" data-lang="en" onclick="switchLang('en')"><span>EN</span></button>
</div>
```

---

## 5. Buttons

### ALL buttons use pill shape: `border-radius: 100px`

| Type | Background | Color | Border | Hover |
|------|-----------|-------|--------|-------|
| Primary | `var(--primary)` (black) | white | none | bg: #222, translateY(-1px), box-shadow: 0 4px 16px rgba(0,0,0,0.18) |
| Accent | `var(--accent)` (#26C6DA) | white | none | bg: var(--accent-dark), translateY(-1px), box-shadow: 0 4px 20px rgba(43,188,192,0.35) |
| Ghost | transparent | var(--text) | 1.5px solid var(--border) | border-color: var(--primary), bg: var(--surface) |

Standard padding: 12px 28px. Hero/CTA buttons: 13px 32px, font-size 15px.

---

## 6. Cards

```css
.card {
    background: white;
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px 22px;
    transition: box-shadow 0.3s, transform 0.3s;
}
.card:hover {
    box-shadow: 0 12px 40px rgba(0,0,0,0.08);
    transform: translateY(-4px);
}
```

### Card Icon
40x40px, background: var(--accent-light), border-radius: 10px, centered emoji/icon 18px.

---

## 7. Section Layout Pattern

```
[Section Label — teal, uppercase, 12px, 0.12em spacing]
[Section Title — Instrument Serif, 40px]
[Section Subtitle — 16px, text-secondary, max-width 460px]
[Content Grid — cards, steps, etc.]
```

Sections alternate between `var(--bg)` and `var(--surface)` backgrounds.
Padding: 72px 32px (desktop), 56px 20px (mobile).

---

## 8. AI Summary / Highlight Box

Used for "AI-generated" content styling:
```css
.summary-box {
    background: rgba(38,198,218,0.06);
    border: 1px solid rgba(38,198,218,0.2);
    border-radius: 8px;
    padding: 10px 12px;
}
.summary-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-dark);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
```

---

## 9. Badges / Tags

- **Accent pill**: bg #2BBCC0, white text, 9-11px, font-weight 700, border-radius 100px
- **Premium badge**: bg rgba(43,188,192,0.08), border rgba(43,188,192,0.3), color var(--accent-dark)
- **Hero label**: bg var(--accent-light), border 1px solid rgba(43,188,192,0.25), text var(--accent-dark)

---

## 10. FAQ Component

- Container: max-width 680px, bg var(--surface), border-top 1px solid var(--border)
- Question: 15px, weight 600, color var(--primary), full-width button
- Chevron: 28px circle, bg var(--surface), border var(--border); OPEN: bg var(--primary), white icon, rotate 180°
- Answer: 14px, color var(--text-secondary), line-height 1.7

---

## 11. Pricing Section (Dark)

ONLY section with dark background:
```css
.pricing {
    background: var(--primary);
    color: white;
}
```
- Toggle: inline-flex, rgba(255,255,255,0.08) bg, pill buttons, active = white bg + black text
- Cards: rgba(255,255,255,0.06) bg, rgba(255,255,255,0.1) border, 20px radius
- Featured card: bg var(--accent), scale(1.03)
- Save badge: bg var(--accent), white text
- Features list: `✓` prefix in teal color, border-bottom rgba(255,255,255,0.08)

---

## 12. Footer

```css
footer {
    padding: 48px 32px 32px;
    background: var(--primary);
    color: white;
}
```
- 4-column grid (2.5fr 1fr 1fr 1fr) on desktop, 1fr 1fr on tablet, 1fr on mobile
- Brand name: Instrument Serif 22px, white
- Tagline: rgba(255,255,255,0.45), 14px
- Link headers: 12px uppercase, rgba(255,255,255,0.45), letter-spacing 0.1em
- Links: rgba(255,255,255,0.65), hover: white
- Email link: color var(--accent)
- Bottom bar: border-top rgba(255,255,255,0.1), text rgba(255,255,255,0.3)

---

## 13. Animations

- **Scroll reveal**: Elements start at opacity:0, translateY(24px), transition 0.6s ease
- **Hero**: slideUpFade keyframe, cubic-bezier(0.22, 1, 0.36, 1), 0.1-0.3s delay
- **Card hover**: transform 0.3s on hover
- **Button hover**: transition all 0.3s ease

---

## 14. Responsive Breakpoints

| Breakpoint | Key Changes |
|-----------|-------------|
| ≤900px | Hide nav-links, H1 36px, section title 30px, grids → 1 column, pricing 1 column |
| ≤480px | H1 30px, CTA buttons full width, footer 1 column |

---

## 15. Blog Article Template Pattern

For blog posts, use this layout:
- Nav: Same fixed frosted glass pattern as homepage
- Article container: max-width 720px, margin auto, padding-top 100px (clear fixed nav)
- H1: Instrument Serif, 40px, weight 600, color var(--primary)
- Author: 14px, color var(--text-tertiary), "By Antonio | Brevis"
- Date + reading time: 13px, color var(--text-tertiary)
- Body: Instrument Sans, 17px, line-height 1.7, color var(--text-secondary)
- H2: Instrument Serif, 28px, weight 600, color var(--primary), margin-top 40px
- H3: Instrument Sans, 20px, weight 700, color var(--primary)
- Links: color var(--accent), hover var(--accent-dark)
- Blockquotes: border-left 3px solid var(--accent), padding-left 20px, Fraunces italic
- Tables: white bg, var(--border) borders, 12px radius
- Code/highlight: summary-box pattern
- CTA at bottom: summary-box pattern with pill CTA button
- Footer: Same as homepage

---

## 16. Voice & Tone

- **Language**: Bilingual ES/EN. Spanish is the default language. English pages use data-en attributes or standalone English pages.
- **Tone**: Professional but warm. Editorial, not startup-y. Magazine feel.
- **Headlines**: Short, confident. Use `<em>` in Fraunces italic (teal) for emphasis words.
- **Body**: Clear, direct. No jargon. Benefit-focused.
- **CTAs**: Action-oriented. "Probar gratis" / "Try for free". Always with reassurance ("Sin tarjeta de crédito" / "No credit card").
