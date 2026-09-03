# Add Condition: targeted mobile stability investigation

## Evidence before changes

Measured the actual AddConditionDialog component in Chrome at 320px and 390px using synthetic catalog/persistence fixtures and production CSS. Search and validation use the real condition helpers. No live health data or database writes were used.

| Metric | 320px | 390px |
| --- | --- | --- |
| Shell top, keyboard closed | 16px | 16px |
| Shell height, 844px viewport | 828px | 828px |
| Header height | 105px | 85px |
| Search footer | Absent | Absent |
| Detail/custom footer | 69px | 69px |
| Search body height | 723px | 743px |
| Detail body height | 654px | 674px |

The reproducible content jump was the **scroll-body boundary**: selecting a condition mounted a 69px footer and removed that height from the body. Returning to search removed the footer again. The previously focused search/result/custom trigger was also removed by conditional DOM replacement without a deliberate focus handoff. The shell itself remained mounted and its top did not move during normal content changes or validation in this reproduction.

The previous shared-sheet work fixed content-driven outer sizing, but Add Condition retained its own conditional footer and stage-switching behavior. The generic polish browser suite did not cover Add Condition; its existing jsdom test could not measure layout.

A simulated 38px visualViewport offset moved the shell's layout-coordinate top from 16px to 54px. This is not by itself proof of a visible jump: a real visual viewport pan requires that compensation to keep the header at the same screen position. No oscillation was observed. The fix therefore does not blindly discard valid offsets.

No portal/popover condition picker exists: search, categories and result buttons are inline. The result list has no separate vertical scroller. No shell geometry animation was found (computed duration 0s). Inputs already used 16px text, so input-font zoom was not reproduced as a cause.

## Changes

- The mobile footer and both actions remain mounted from search through catalog/custom details. Add is disabled until a condition is chosen. Desktop retains the previous hidden search footer and centered content-sized presentation.
- Header, footer and body identities persist across conditional sections and validation. Explicit mobile viewport height is retained.
- Mobile shell uses overflow:clip rather than overflow:hidden: it cannot become a programmatically scrolled focus ancestor. The body is the one vertical scroll region, with scroll anchoring disabled and immediate scrolling. Category chips retain horizontal scrolling.
- Add Condition temporarily disables root document smooth scrolling/overscroll and locks root overflow, supplementing the shared body lock. Original styles are restored on unmount.
- Stage transitions reset only body scroll and focus the search input, custom-name input, or selected-condition panel using preventScroll. Validation focuses an internal alert wrapper; only body scrolling reveals it. Unrelated stale validation is cleared when choosing a different stage. Validation rules/persistence are unchanged.
- A default-off `boundMobileViewport` option in useSheetDialog is enabled only here. It clamps impossible transient offsets/heights to layout bounds on narrow screens, preserving valid keyboard height and pan compensation. Other callers and desktop viewport handling remain unchanged. No new listeners, debounce, height animation or React viewport state were added.

## Regression and acceptance

`scripts/add-condition-mobile-check.mjs` exercises search, category filtering, catalog selection, custom entry, status dropdown opening/dismissal, Chrome native date picker opening/dismissal, date/year alternatives, primary checkbox, notes, scrolling, native and application validation, failed save, success, close and reopen. It checks DOM identity, header/footer size, anchored bounds within 1px, document/shell scroll offsets, one vertical scroller, and cleanup/focus restoration. It simulates keyboard resize, real pan compensation, and impossible full-height picker offsets. It uses geometry assertions, not screenshot comparisons.

- 320px and 390px: pass. Search focus, typing/filtering, conditional stages and validation retain anchored controls; actual available-height changes resize the body and keep the footer at the visible bottom.
- Failed input preservation, successful reset and reopen state: pass. Existing five condition tests: pass.
- Native Chrome select/date picker interactions: pass. This is not certification of iOS/Android native picker behavior.
- Keyboard and validation screenshots visually inspected at 320px/390px. The blank area below the simulated keyboard viewport is fixture space, not an actual rendered keyboard.
- TypeScript, ESLint and production build: pass.

Temporary measurement logging was confined to the reproduction harness and removed after investigation. No application diagnostics remain. Screenshots are ignored artifacts under coverage/.

## Scope and remaining limits

Modified: components/health/AddConditionDialog.tsx; components/ui/useSheetDialog.ts (default-off option only).
Created: scripts/add-condition-mobile-check.mjs; this report.

No schema, RLS, persistence, authentication, analytics or timeline changes; no migration.

The reproducible browser layout defect is fixed and the tested interaction sequence is stable. The original physical-device symptom has not been directly observed on a phone. Actual software keyboard animation, browser chrome, pinch zoom, safe-area hardware and iOS/Android picker behavior still require physical-device acceptance; simulated visualViewport events cannot certify those effects.
