# LABLINK Accessibility Verification (WCAG 2.2 AA)

This document records the accessibility controls implemented in the LABLINK frontend and distinguishes automated verification performed in code/CI from manual desktop browser and assistive-technology checks.

## Implemented Accessibility Controls

1. **Keyboard Navigation & Landmarks**
   - Single skip-to-content link (`Skip to main content`) jumping directly to `#main-content` (`Layout.tsx`).
   - Semantic landmarks: `<header>`, `<nav aria-label="Primary navigation">`, `<main id="main-content" tabIndex={-1}>`, and `<footer>`.
   - Route transitions dynamically update `document.title` and move keyboard focus to the active view's `<h1>` heading.
   - All interactive controls meet minimum `44px` target height (`min-h-[44px]`).

2. **Forms, Errors & Dialogs**
   - Every input, select, checkbox, radio button, and textarea has an explicit associated `<label htmlFor>` or `<fieldset><legend>` verified by `eslint-plugin-jsx-a11y` (`label-has-associated-control`).
   - Validation and API failures surface `aria-invalid`, `aria-describedby`, and `role="alert"` regions.
   - Confirmation and edit modals use native HTML `<dialog>` (`showModal()` / `close()`), `aria-labelledby`, `aria-describedby`, and Escape-key dismissal (`AccessibleDialog.tsx`).
   - Polite announcements (`role="status"`, `aria-live="polite"`) announce sign-ins, booking confirmations, approvals, rejections, and cancellations.

3. **Data Visualization & Status Semantics**
   - `UtilizationChart` pairs an accessible inline `<svg role="img">` (`<title>`, `<desc>`, explicit `<text>`) with an accompanying semantic HTML `<table>` (`<caption>`, `<th scope="col">`).
   - Status indicators pair icons with explicit text labels (`StatusLabel.tsx`) rather than relying on color alone.
   - Global CSS respects `@media (prefers-reduced-motion: reduce)`.

## Verification Checklist

### Automated Checks (Verified in Repo)
- [x] `eslint-plugin-jsx-a11y` recommended + `label-has-associated-control` static linting (`npm run lint`)
- [x] `vitest-axe` automated axe-core audits on Login, Marketplace, Equipment Detail & Request Form, Faculty Review Queue, and Utilization Chart + Table (`npm test`)
- [x] Native `<dialog>` polyfill & Escape/close behavior verified in jsdom tests

### Manual Desktop Browser & Screen-Reader Checks (Pending Live Desktop Browser Session)
- [ ] Manual keyboard-only walkthrough (`Tab` / `Shift+Tab` / `Enter` / `Esc`) across `320px`, `768px`, and `1440px` viewports in Chromium/Firefox
- [ ] Manual screen-reader walkthrough with NVDA or VoiceOver verifying `aria-live` announcements and `<dialog>` focus return
- [ ] Manual OS high-contrast mode / 200% browser zoom inspection
