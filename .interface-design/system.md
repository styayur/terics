# terics Interface System

## Intent

- **Human:** a university student who has just authenticated to the registrar and needs a trustworthy, portable copy of this term's timetable.
- **Job:** verify the live timetable, spot changed/cancelled meetings, correct term timing, and export a calendar they can trust.
- **Feel:** a registrar's planning desk: precise, calm, paper-and-ink, visibly local, never a generic analytics dashboard.

## Domain

1. Teaching-week ruler and semester cadence.
2. Period grid with morning/afternoon/evening bands.
3. Course meeting blocks and multi-period spans.
4. Classroom, campus, teacher and teaching-class provenance.
5. Cancellation, rescheduling and makeup annotations.
6. Semester date boundaries and first teaching Monday.
7. Academic registrar source and extraction validation.

## Color World

- `--blackboard`: `#111610` — registrar chalkboard / primary ink.
- `--syllabus`: `#F3EFE1` — warm paper handout.
- `--ledger`: `#E6E1D2` — ruled table paper.
- `--registration-orange`: `#E9521D` — registration stamp / active week.
- `--chalk-green`: `#B9E769` — local-ready signal, used sparingly.
- `--cancel-vermilion`: `#B83224` — cancellation and destructive action.
- `--room-ink`: `#556B73` — quiet room/location metadata.
- `--warning-ochre`: `#A76400` — partial or unverified data.

## Signature

**The teaching-week ruler.** A horizontal row of numbered week notches drives the timetable view; the current week is stamped in registration orange, and cancelled/rescheduled occurrences notch through the same ruler. The ruler appears in Web, extension previews and desktop headers so the product remains recognisable across surfaces.

## Rejected Defaults

- Dashboard metric-card strip → provenance and completeness read as a compact registrar ledger attached to the timetable.
- Generic left navigation + card feed → one continuous weekly timetable is the focal object; import/settings are supporting drawers/sections.
- Decorative colored badges for every state → one route color for normal course blocks, with dashed/broken geometry for cancellations and an ochre ledger note for partial data.

## Direction

- **Density:** workbench-tight, 4px base unit; 8/12/16/24px spacing steps.
- **Hierarchy:** timetable first; selected week and course detail second; import/export configuration third.
- **Depth:** borders-only, one hue, whisper-quiet rules. No glass, gradients or large shadows.
- **Typography:** condensed signage sans for UI; tabular mono for dates, week numbers and times; restrained serif only for the product statement.
- **Surfaces:** syllabus paper base, ledger rows, input surfaces slightly inset; blackboard header/export rail.
- **Motion:** 120–180ms opacity/transform only; week changes use a short horizontal reveal; reduced motion removes movement.

## Components

- **Week ruler:** 32px height, numbered 24px notches, 44px hit targets, orange stamped current week.
- **Timetable grid:** 7 columns desktop; mobile uses a scrollable day lane with sticky period labels.
- **Course block:** name first, room/time metadata second; normal uses subtle orange-tinted surface, cancellation uses broken border, reschedule/makeup uses a corner flag.
- **Provenance ledger:** source, adapter, term, extraction time and validation as a ruled list, not KPI cards.
- **Primary action:** 36px minimum height, blackboard fill with cream text; focus ring uses orange at 3px.
- **Status:** plain text + one small geometric marker; color never carries meaning alone.

## Accessibility

- 44px minimum touch targets where space allows; 40px absolute minimum.
- Visible `:focus-visible` rings; no hidden keyboard path.
- Text contrast meets WCAG AA for normal text.
- `prefers-reduced-motion` disables movement while retaining opacity/color changes.
- Week and course state include text/geometry, never color alone.


## Audit — 2026-11-06

- **Swap test:** replacing the week ruler with a generic tab strip or the course grid with a card feed removes the semester cadence and makes the product indistinguishable from a generic calendar dashboard. Both were rejected.
- **Squint test:** at 1440px the timetable is the dominant field; provenance and configuration remain subordinate ruled areas. At 390px the body has no horizontal overflow and only the timetable viewport scrolls.
- **Signature test:** the teaching-week ruler, stamped current week, multi-period course geometry, dashed cancellation blocks and registrar provenance ledger consistently carry the signature across Web, extension and desktop.
- **Token test:** semantic tokens use domain language (`blackboard`, `syllabus`, `ledger`, `registration-orange`, `chalk-green`, `cancel-vermilion`, `room-ink`, `warning-ochre`) rather than anonymous UI grays.
- **States checked:** empty, loading, error, partial validation, conflict acknowledgement, cancellation, reschedule, makeup, disabled export and local-only privacy.
- **Accessibility checked:** semantic buttons/forms, visible focus, keyboard-activated course details, Escape close, text/geometry state cues and reduced-motion CSS.
- **Visual evidence:** Web 1440×1100 and 390×844 screenshots; Edge extension popup at 410×900; Python Tkinter smoke test and Canvas preview construction.
