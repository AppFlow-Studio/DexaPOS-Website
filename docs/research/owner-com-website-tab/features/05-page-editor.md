# 05 — The page editor

`/brands/{brandId}/website/pages/{pageId}?locationId={loc}`

The centrepiece of the whole feature.

![Page editor with gutter controls and Add Section dividers](../screenshots/07-page-editor-home.png)

---

## 1. Chrome

```
┌ ⊗ Close │ Home │ [ 🔧 Build │ 👁 Preview ] │ 💬 │ Publish ⬆ ┐
└──────────────────────────────────────────────────────────────┘
```

- **Page title is the context label** — and in our own rebuild it doubles as the entry point to page settings
  (rename / web address / delete). Owner exposes page deletion from the list instead.
- **`Publish` is per page**, blue, top-right, with an upload glyph.
- The sidebar is gone entirely. Full-bleed canvas.

### Build vs Preview

`Preview` removes **all** editing affordances — gutter controls, Add Section dividers, hover outlines:

![Editor in Preview mode — all chrome hidden](../screenshots/13-editor-preview-mode.png)

It is the same DOM, not a new window or an iframe swap; it is a mode flag on the canvas. Cheap to build,
and it answers "what will this actually look like?" without a round trip.

There is **no device/viewport switcher** in the dashboard editor. (The ops app's Website screen has a
Desktop/Mobile radio; the real editor does not.) Owner's layouts are responsive by construction, so there is
nothing for the merchant to check.

---

## 2. The canvas

A **single column** of stacked sections, rendered as the real site at real fidelity — actual photos, actual
copy, actual fonts.

There is:

- **No drag-and-drop.** Reordering is by explicit up/down buttons.
- **No grid, no columns, no free positioning.** A section spans the full width; its internal layout is chosen
  from a fixed option (e.g. `Alignment: Left | Right`).
- **No zoom, no rulers, no canvas panning.**
- **No multi-select, no copy/paste of sections.**

The merchant edits a *document*, not a *canvas*. This is the core decision the whole product rests on.

---

## 3. Gutter controls

Controls live **outside the page frame**, in the margins, so they never occlude content. They appear per section.

```
        ┌─────────────────────────────────┐
 ✏️     │                                 │      ⬆
 🗑     │        section content          │      ⬇
        └─────────────────────────────────┘
   left gutter                            right gutter
     (x≈304)                                (x≈1234)
```

| Gutter | Controls | Icon path signature (for automation) |
|---|---|---|
| Left, top | ✏️ **Edit** | `M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,…` |
| Left, bottom | 🗑 **Delete** | `M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,…` |
| Right, top | ⬆ **Move up** | `M128,24A104,104,0,1,0,232,128,104.11,104.11,0…` |
| Right, bottom | ⬇ **Move down** | same circle path, rotated |

All four share the class `preview-icon-button`. **The two move buttons use an identical SVG path** (a circle
with an arrow, flipped by transform), so they cannot be told apart by path alone — only by DOM order or position.

> ⚠️ **Automation warning.** The control set differs per section (below), so "the first `preview-icon-button`
> in this section" is **not** reliably Edit. On a section without an Edit button, the first control is Delete
> or Move. This is exactly how the capture accidentally opened a delete confirmation and reordered FAQ.
> Always verify the pencil path (`M227.31…`) before clicking.

### Delete confirmation

Deleting raises a dialog — `data-testid="delete-confirmation-dialog"`:

> **Delete Section**
> Are you sure you want to delete this section?
> **[ Delete ]**

Destructive actions are confirmed. Note there is **no undo toast** afterwards — the confirm *is* the safety net.
(Our own build kept a delete-undo toast, which is a defensible improvement since it is now the only way back.)

---

## 4. `Add Section` dividers

Between **every** pair of sections sits a full-width, subtle grey bar:

```
────────────  ⊕ Add Section  ────────────
```

On the Home page there were **16** of them for 18 blocks — one after each insertable position.

This is a genuinely good pattern and worth copying verbatim:

- Insertion position is **explicit and unambiguous** — you click where the section will go, rather than adding
  to the end and then moving it up nine times with a button.
- It makes the page's structure legible even before you interact: you can see the seams.
- It costs nothing in a no-drag-drop world, and it removes the main reason people want drag-and-drop.

---

## 5. Per-section permissions — the key mechanism

**The controls a section gets depend on what kind of section it is.** This is how Owner keeps every site
structurally sound while still feeling editable.

| Section | Edit | Delete | Reorder | Why |
|---|:---:|:---:|:---:|---|
| Header / navigation | ✅ | ❌ | ❌ | Structural. Must exist, must be first. |
| Hero | ✅ | ❌ | ❌ | Every page needs a top. |
| Content / Gallery / Reviews / Features | ✅ | ✅ | ✅ | Ordinary composable content. |
| **Featured / Popular Items** | ❌ | ✅ | ✅ | Content comes from the **menu**. Nothing to edit. |
| **FAQ** | ❌ | ❌ | ✅ | Content managed outside the page editor. |
| Our location (map) | ❌ | ❌ | ❌ | Renders from Location settings. |
| Footer | ❌ | ❌ | ❌ | Structural. Must exist, must be last. |

Read the pattern:

- **No Edit** ⇒ the content is owned by another system (menu, settings, another screen).
- **No Delete** ⇒ the section is structurally required.
- **No Reorder** ⇒ its position is part of the layout contract (top or bottom).

The enforcement is by **omitting the control entirely** — not disabling it, not erroring on click. The merchant
never discovers the limit by hitting a wall; the affordance simply is not there.

**This is the single most copyable idea in the whole teardown.** Our section registry should carry per-kind
capability flags (`editable`, `deletable`, `movable`) rather than treating every section as equally free.

---

## 6. Section editors — the left flyout

Clicking ✏️ **pushes a route** (`/pages/{pageId}/blocks/{blockId}`) and slides in a left panel. The canvas stays
live on the right and updates as you type.

```
┌ ⊗ Close │ Home │ [ Build │ Preview ] │ 💬 │ Publish ┐
├──────────────┬───────────────────────────────────────┤
│  field       │                                       │
│  field       │      live canvas, still scrollable    │
│  field       │                                       │
│  ──────────  │                                       │
│  [  Done  ]  │  ← full-width blue, pinned bottom     │
└──────────────┴───────────────────────────────────────┘
```

`Done` **closes the panel; it does not save to the server.** It commits to the in-memory draft only.

Per-section field reference: [06 — Section types](06-section-types.md).
Raw dump of all 16 Home editors: [`../raw/home-section-editors.txt`](../raw/home-section-editors.txt).

---

## 7. Draft / publish model — copy this exactly

Closing the editor with pending edits raises:

> **You have unsaved changes**
> *If you leave this page you will lose your unsaved changes, are you sure you want to discard changes?*
> **[ Continue Editing ]   [ Discard unsaved changes ]**

`Discard unsaved changes` is styled destructive (red text on pink).

### There is no autosave

Verified directly: after reordering a section and then reordering it back, closing still raised the prompt;
discarding returned the stored draft to its original state, and re-opening raised no prompt.

The model is three clean states:

```
   published  ──────────────────►  what visitors see
       ▲
       │ Publish (explicit, per page)
       │
     draft  ◄────── Done ──────  in-memory edits
       ▲
       │ Discard unsaved changes
```

**Trade-off, stated honestly:** no autosave means a browser crash loses work. Owner accepts that in exchange
for a merchant never being able to half-break their live site by wandering off mid-edit. Our own build kept
autosave machinery but removed the indicator — a defensible deviation, since losing a merchant's work is worse
for us than for a company that also builds the site for them. But if we keep autosave, **we must keep an
explicit publish step**, or the whole safety property collapses.

---

**Prev:** [04 — New Page](04-new-page.md) · **Next:** [06 — Section types](06-section-types.md)
