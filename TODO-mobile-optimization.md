# Mobile Optimization Implementation Spec

## Overview
Optimize the wedding website for mobile viewing with two key improvements:
1. Fix navigation tabs to spread horizontally instead of stacking vertically
2. Tighten line-height/spacing for body text (both mobile and desktop)

**Critical Requirement**: All mobile changes must be isolated using media queries so they don't affect desktop layout.

---

## Issue 1: Navigation Tabs Stacking Vertically on Mobile

### Current State
- **Location**: `index.html` lines 102-136 (CSS), lines 1616-1625 (HTML)
- **Problem**: On mobile, the 5 tabs (Home, Itinerary, Venue & Travel, Registry, RSVP) stack vertically and left-align, blocking significant screen real estate
- **Root Cause**: The `flex justify-center items-center` container doesn't prevent wrapping, and at small widths, tabs wrap to multiple lines

### Current Code
```html
<nav class="tab-nav">
    <div class="flex justify-center items-center">
        <button class="tab-button active" data-tab="home">Home</button>
        <button class="tab-button" data-tab="itinerary">Itinerary</button>
        <button class="tab-button" data-tab="travel">Venue & Travel</button>
        <button class="tab-button" data-tab="registry">Registry</button>
        <button class="tab-button" data-tab="rsvp">RSVP</button>
    </div>
</nav>
```

```css
@media (max-width: 640px) {
    .tab-button {
        padding: 0.75rem 0.5rem;
        font-size: 0.7rem;
        letter-spacing: 0.08em;
    }
}
```

### Solution
Add mobile-specific flexbox rules to ensure tabs spread horizontally and don't wrap:

```css
/* Add to the existing @media (max-width: 640px) block around line 130 */
@media (max-width: 640px) {
    .tab-nav > div {
        flex-wrap: nowrap;
        justify-content: space-between;
        width: 100%;
        padding: 0 0.25rem;
    }
    .tab-button {
        padding: 0.75rem 0.25rem;
        font-size: 0.6rem;
        letter-spacing: 0.04em;
        flex: 1;
        text-align: center;
        white-space: nowrap;
    }
}
```

### Alternative: Abbreviate Tab Names on Mobile
If text still doesn't fit, consider shorter labels for mobile:
- "Venue & Travel" → "Travel"
- Use data attributes and CSS to swap text, or JavaScript

### Testing Checklist
- [ ] All 5 tabs visible in a single row on 375px viewport
- [ ] Tabs spread evenly across full width
- [ ] Touch targets remain at least 44px height (0.75rem padding gives ~40px, may need slight increase)
- [ ] Desktop layout unchanged (test at 1024px+)

---

## Issue 2: Body Text Line-Height Too Loose

### Current State
- **Problem**: Text appears "double-spaced" on both mobile and desktop
- **Root Cause**: Multiple line-height values throughout the codebase, many set to 1.75-1.85

### Current Values (found via grep)
| Location | Current Value | Context |
|----------|---------------|---------|
| Line 35 | `line-height: 1.65` | body default |
| Line 302 | `line-height: 1.75` | `.tab-page p, .tab-page li` |
| Lines 1674-1762 | `line-height: 1.8` | Multiple inline styles on paragraphs |
| Line 1648 | `line-height: 1.85` | Hero subtitle |
| Line 1781 | `line-height: 1.75` | Gallery intro text |

### Recommended Values (per UX guidelines)
- **Body text**: 1.5-1.6 (Tailwind's `leading-relaxed` = 1.625)
- **Headings**: 1.1-1.3
- **Small text/UI**: 1.4-1.5

### Solution

**Step 1: Update global CSS rules** (affects both mobile and desktop)
```css
/* Line 35 - body */
body {
    line-height: 1.5;  /* was 1.65 */
}

/* Line 302 - tab-page paragraphs */
.tab-page p,
.tab-page li {
    line-height: 1.55;  /* was 1.75 */
}
```

**Step 2: Update inline styles** (search and replace)
Replace all `line-height: 1.8` with `line-height: 1.55`
Replace all `line-height: 1.85` with `line-height: 1.55`
Replace all `line-height: 1.75` with `line-height: 1.55`

**Step 3: Add mobile-specific override if tighter spacing needed**
```css
@media (max-width: 768px) {
    .tab-page p,
    .tab-page li {
        line-height: 1.45;
    }
}
```

### Testing Checklist
- [ ] Body text no longer looks "double-spaced"
- [ ] Text remains readable (not too cramped)
- [ ] Paragraphs have clear separation (via margins, not excessive line-height)
- [ ] Long paragraphs are comfortable to read on mobile

---

## Implementation Order

### Phase 1: Typography (affects both desktop and mobile)
1. [ ] Update `body` line-height from 1.65 → 1.5
2. [ ] Update `.tab-page p, .tab-page li` line-height from 1.75 → 1.55
3. [ ] Find/replace inline `line-height: 1.8` → `line-height: 1.55`
4. [ ] Find/replace inline `line-height: 1.85` → `line-height: 1.55`
5. [ ] Test on desktop - verify improved appearance

### Phase 2: Mobile Navigation
6. [ ] Add mobile-specific `.tab-nav > div` styles (flex-wrap, justify-content)
7. [ ] Adjust `.tab-button` padding/font-size for mobile
8. [ ] Test on 375px viewport - verify all tabs fit in one row
9. [ ] Test on 768px viewport - verify transition point
10. [ ] Test on desktop - verify no changes

---

## Files to Modify

**Single file**: `/Users/adam/Developer/Wedding-Website/index.html`

All CSS is embedded in the `<style>` block (lines 9-1615).

### Specific Line References
- **Line 35**: body line-height
- **Line 130-136**: Existing mobile tab button styles (expand this block)
- **Line 302**: .tab-page p, li line-height
- **Lines 1648, 1674-1762, 1781**: Inline line-height styles to update

---

## Verification

After implementation:
1. Test on iPhone SE (375px width) - smallest common mobile
2. Test on iPhone 14 (390px width) - common mobile
3. Test on iPad (768px width) - tablet breakpoint
4. Test on desktop (1024px+) - ensure no regressions
5. Visual comparison: before/after screenshots

---

## Notes

- The site uses Tailwind CDN + custom CSS, so all changes are in the embedded `<style>` block
- Mobile breakpoint at 640px aligns with Tailwind's `sm:` breakpoint
- Touch target minimum is 44x44px - current tab height with 0.75rem padding is borderline
