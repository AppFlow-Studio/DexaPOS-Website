/**
 * Whether an Escape keypress is the editor drawer's to answer.
 *
 * Extracted from `useEscapeClosesDrawer` so the rule can be tested against a
 * synthetic event: the hook itself lives in a module that reaches a Server
 * Action, and the bug being guarded against is entirely about the *event*, not
 * about React.
 */
export function escapeClosesDrawer(event: KeyboardEvent): boolean {
  if (event.key !== "Escape") return false;

  /*
    An open popover, dropdown or dialog owns this Escape, and one keypress must
    not dismiss two things when only one of them was asked for.

    This used to be a DOM probe for an open Radix layer, and it could not work:
    the listener is on `window`, Radix closes from a `document` listener, and
    events bubble target → … → document → window. By the time the guard ran the
    layer had already unmounted, the query matched nothing, and the drawer
    closed underneath it too — reproduced 3/3 by hand.

    `defaultPrevented` asks the same question about *this event* rather than
    about the state of the DOM after the fact. Radix calls `preventDefault()`
    when it handles an Escape, so this reads as: someone already answered it.

    The rejected alternative was `{ capture: true }`, to run before Radix. It
    works, but it inverts the ordering and leaves the next reader reasoning
    about event phases to understand a one-line guard.
  */
  if (event.defaultPrevented) return false;

  // A field is mid-edit; Escape reverts the field, not the drawer around it.
  const target = event.target;
  if (
    target instanceof Element &&
    target.matches("input, textarea, select, [contenteditable]")
  ) {
    return false;
  }

  return true;
}
