// Checkout fields are meant to read as "always focused, just dimmer": they carry
// a resting amber ring (the storefront `--ring`/`--primary` at low opacity) that
// brightens and thickens on actual focus. Reused across every checkout text field
// so the whole form feels consistent.
//
// `--ring` is set to the storefront primary in app/sites/lib/theme-utils.ts, and
// the base <Input /> already renders the focus ring via `focus-visible:ring-*`,
// so here we only add the resting ring plus a slightly brighter focus color.

// For elements that receive focus directly (<Input />, <textarea />).
export const CHECKOUT_FIELD_RING =
  "ring-2 ring-ring/30 outline-none transition-[box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/60";

// For the phone control: focus lands on an inner input, so the ring lives on the
// container and brightens via `:focus-within`.
export const CHECKOUT_PHONE_RING =
  "[&_.react-international-phone-input-container]:ring-2 [&_.react-international-phone-input-container]:ring-ring/30 [&_.react-international-phone-input-container]:transition-[box-shadow] [&_.react-international-phone-input-container:focus-within]:ring-[3px] [&_.react-international-phone-input-container:focus-within]:ring-ring/60";
