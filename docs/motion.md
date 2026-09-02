# Motion

How things appear, move and disappear in Soma, and why. The tokens live in
`src/index.css` (`--motion-*`, `--ease-*`, `--animate-*`), their JavaScript
mirror in `src/lib/motion.ts`.

The goal is not "everything animates". The goal is that the interface answers:
a press is felt before its result arrives, a screen change reads as a step in
or a step out, a list change is seen rather than inferred, and a record the
user just clicked keeps existing on the next screen. Motion that does not
answer something is left out.

## Palette

Three durations, two curves. Nothing else.

| Token             | Value | Role                                                                      |
| ----------------- | ----- | ------------------------------------------------------------------------- |
| `--motion-quick`  | 120ms | Feedback: hover, press, focus, toggles, chevrons, popovers, **all exits** |
| `--motion-base`   | 180ms | Reveal: page and content entrances, dialogs, toasts, list newcomers       |
| `--motion-slow`   | 280ms | Spatial: accordion height, list reorder (FLIP), row collapse              |
| `--motion-linger` | 600ms | The one exception: attention that decays (the ⌘K highlight tint)          |

| Curve             | Value                            | Use                    |
| ----------------- | -------------------------------- | ---------------------- |
| `--ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | Everything that enters |
| `--ease-in-firm`  | `cubic-bezier(0.4, 0, 1, 1)`     | Everything that leaves |

Rules that follow from the palette:

- Exits are shorter than entrances (quick vs base) and accelerate. The thing
  the user dismissed should be gone before they look for it.
- Every `transition-*` utility in the app runs on the quick clock with the
  soft curve by default (`--default-transition-duration` in `@theme`). Do not
  put `duration-150`/`duration-200` on call sites; use a token if you need
  another clock: `duration-[var(--motion-slow)]`.
- Only `opacity` and `transform` are animated, with three named exceptions
  below. WKWebView composites those off the main thread; anything else
  re-lays out on every frame.

## Roles

### Feedback (quick)

Utility: `press`. Colour/opacity transition plus `scale(0.97)` on `:active`.
On every button variant except `link`, on record cards, sidebar items, chips,
the back button. Every interactive element also has a visible
`focus-visible` ring — a control that reacts to hover but not to focus or
press is a control that feels dead from the keyboard.

### Reveal (base)

`animate-reveal` — fade plus a 6px rise. For content that appears in place:
a wizard step, a section that finished loading, an empty state, a chat bubble.
`animate-fade-in` for things that must not move (the loading indicator, a
tooltip positioned by transform).

### Screen transition (base, directional)

The shell sets `data-motion` on the page wrapper from the navigation journal
(`usePageMotion` → `pageMotion()`):

| Direction | When                                            | Motion               |
| --------- | ----------------------------------------------- | -------------------- |
| `drill`   | A link marked `drillState`; forward in history  | Fade, from the right |
| `back`    | Back button, ⌘[, crumb, browser back            | Fade, from the left  |
| `lateral` | Sidebar, ⌘K, a notification, first load         | Fade, 4px rise       |
| `none`    | REPLACE (`?highlight=` consumed, thread switch) | No entrance          |

The keyframes sit on the page's _root elements_, not the wrapper: the wrapper
mounts empty while the page resolves its query, and would burn its animation
on nothing. The first four root children are staggered by 25ms so the header
lands first and the content settles under it. There is deliberately **no exit
animation for pages**: it would keep the old page mounted, which breaks the
shell's scroll restoration and doubles the DOM on every navigation for a fade
nobody waits for.

**Continuity, not duration, is what makes a transition feel smooth.** When a
record is opened from a list, the list already knows its name, date and latest
value. That travels with the click as a _seed_ (`src/app/seed.ts`,
`seedState` / `useSeed`) and the detail page renders its header, badges and
static explainer from it in the same frame; the query then fills in the chart
and the table underneath. The row the user was reading turns into the title
they are now reading. Seeds are hints: a deep link has none and the page waits
as before; the loaded record replaces the seed when it arrives. Biomarkers
(from the list and from a panel row) and lab panels (from the labs list) carry
seeds today; any list → detail pair can adopt the same two calls.

View Transitions were considered and rejected: they are absent on the
supported baseline (macOS 13 ships WebKit 16, Ubuntu 22.04 ships WebKitGTK
2.36–2.44; the API arrived in Safari 18 / WebKitGTK 2.46), they freeze
rendering of the whole document for the duration, and they would have to
snapshot the new page _after_ a synchronous React commit — which is exactly
the moment the page is still an empty wrapper.

### Layer (base in, quick out)

Dialogs, the command palette and the date picker: `animate-dialog-in` /
`-out` (fade, 8px settle, scale 0.98) over `animate-overlay-in` / `-out`.
Menus, comboboxes, tooltips: `animate-popover-in` (fade, scale 0.97 from the
anchor's `transform-origin`); they close instantly, as native menus do. Toasts:
`animate-toast-in` / `-out`, sliding up from the corner and sinking back into
it; a toast is removed from the DOM only after its exit ends.

Positioning and animation never share an element: an entrance keyframe that
animates `transform` with `fill: both` would override an inline
`translate(...)` for good. The date picker and the tooltip keep their offset
on a wrapper (or animate opacity only) for this reason.

### List change (base for newcomers, slow for movers)

`useListMotion(keys)` on the container, `data-motion-key` on every row or card:

- First render: rows enter with a stagger.
- Sort: survivors slide from their old position to the new one (FLIP,
  transform only; measured relative to the container so scrolling is not
  mistaken for movement).
- Filter: survivors slide to close gaps, newcomers fade in with a stagger.
- Unchanged order: nothing.

Stagger is `min(index, 12) × 20ms` (`staggerDelay`): the first dozen ripple in,
the rest arrive as one block 240ms in. Lists past 150 items are not animated
per item at all — the page entrance still covers them.

`useLeaving().leave(key, commit)` runs the write _after_ the row has faded,
so the disappearance itself confirms the click. In a grid the neighbours then
close the gap via FLIP; in a single-column list pass `{ collapse: true }` and
the row's height closes too (a layout animation on one element — the
alternative is every row below jumping up).

### Attention (linger)

The ⌘K highlight (`useHighlight`) tints the target row on arrival and lets
the tint dissolve over the linger clock. It is the only slow fade in the app,
because it is the only place where "slowly fading" _is_ the message.

## Not animated, and why

- **Page exits** — see above.
- **Data values changing in place** (a number in a card after a reload). A
  count-up or a flash would suggest the value is live; it is a database row.
- **Hover on table rows and list rows** beyond a colour change. Rows are
  reading surfaces, not buttons.
- **Chart internals** (Recharts) beyond what the library does — a
  medical trend that wiggles into place is a trend the user cannot trust.
- **Skeleton pulse under reduced motion** — replaced by a static muted block.
- **Sidebar and chrome** — the frame stays still so the page can move.
- **The spinner's 180ms delay** (`useDelayedFlag`) is not motion and must
  stay: a local query usually settles before it, and a spinner that flashes
  for one frame is worse than none.

## Layout animations, the three exceptions

1. `Collapsible` / `TimelinePanel`: `grid-template-rows: 0fr → 1fr` (slow).
   The only way to reveal an auto-height region; one element, bounded.
2. `AutoHeight`: `height` (slow), wizard step swaps. Same reason.
3. `useLeaving` with `collapse`: `height → 0` on the departing row.

Anything else that needs layout to move should be reconsidered.

## Reduced motion

`@media (prefers-reduced-motion: reduce)` in `index.css`:

- Every entrance becomes a 120ms opacity fade, every exit a 100ms fade.
- Direction, stagger and FLIP are dropped (`prefersReducedMotion()` guards the
  JavaScript side). What they conveyed is also carried by the back button, the
  breadcrumbs, the row count and the toast, so no meaning depends on them.
- `press` no longer scales.
- The spinner keeps turning (it is status, not decoration); the skeleton pulse
  becomes a static block rather than a flicker.
- Row removal runs the write at once.

## Adding motion

Ask which role it is. If none fits, it probably should not move. Then use the
token for that role, put the animation on the element that actually appears
(not on an empty container), keep `transform`/`opacity`, and add the new class
to the reduced-motion block.
