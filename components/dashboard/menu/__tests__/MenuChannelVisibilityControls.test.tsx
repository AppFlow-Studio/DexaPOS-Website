// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_MENU_CHANNEL_VISIBILITY,
  type MenuChannelVisibility,
} from "@/lib/menu/menu-channel-visibility";
import { MenuChannelVisibilityControls } from "../MenuChannelVisibilityControls";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mounted: {
  root: ReturnType<typeof createRoot>;
  container: HTMLDivElement;
}[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

const ALL_ON = DEFAULT_MENU_CHANNEL_VISIBILITY;

/**
 * A write the component has handed us but that has not reached the server yet.
 * Holding these lets a test decide the order in which requests *complete*,
 * independently of the order they were issued in.
 */
interface InFlightWrite {
  intent: MenuChannelVisibility;
  land: () => void;
}

function mountControls(options: { failWrite?: number } = {}) {
  const inFlight: InFlightWrite[] = [];
  const sent: MenuChannelVisibility[] = [];
  const server = { state: ALL_ON };
  let setServerValue: (next: MenuChannelVisibility) => void = () => {};

  function Harness() {
    const [value, setValue] = useState<MenuChannelVisibility>(ALL_ON);
    setServerValue = setValue;

    return (
      <MenuChannelVisibilityControls
        value={value}
        onChange={(next) => {
          const index = sent.push(next) - 1;

          return new Promise<boolean>((resolve) => {
            inFlight.push({
              intent: next,
              land: () => {
                if (options.failWrite === index) {
                  resolve(false);
                  return;
                }
                // The real handlers persist and then await the query
                // invalidations, so the value prop has already caught up by
                // the time onChange resolves.
                server.state = next;
                setValue(next);
                resolve(true);
              },
            });
          });
        }}
      />
    );
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(<Harness />));

  const switchFor = (label: string) => {
    const el = container.querySelector<HTMLButtonElement>(
      `[aria-label="${label} visibility"]`,
    );
    if (!el) throw new Error(`no switch labelled "${label}"`);
    return el;
  };

  return {
    container,
    sent,
    server,
    inFlight,
    setServerValue: (next: MenuChannelVisibility) =>
      act(() => setServerValue(next)),
    toggle: (label: string) => act(() => switchFor(label).click()),
    shown: (): MenuChannelVisibility => ({
      is_visible_on_pos: switchFor("POS").getAttribute("aria-checked") === "true",
      is_visible_on_kiosk:
        switchFor("Kiosk").getAttribute("aria-checked") === "true",
      is_visible_online:
        switchFor("Online Ordering").getAttribute("aria-checked") === "true",
    }),
    /**
     * Complete every outstanding request newest-first — the reverse of the
     * order they were issued in — repeating until the component stops writing.
     */
    landNewestFirst: async () => {
      while (inFlight.length > 0) {
        const write = inFlight.pop()!;
        await act(async () => {
          write.land();
        });
      }
    },
  };
}

describe("MenuChannelVisibilityControls", () => {
  it("moves the switch before the write lands", () => {
    const ui = mountControls();

    ui.toggle("POS");

    expect(ui.shown().is_visible_on_pos).toBe(false);
    expect(ui.server.state).toEqual(ALL_ON);
  });

  it("serialises a burst so two writes cannot be in flight at once", () => {
    const ui = mountControls();

    ui.toggle("POS");
    ui.toggle("Kiosk");

    // The second toggle queues behind the first rather than racing it. Two
    // concurrent whole-object writes are what lets a slow earlier one land
    // last and overwrite the field the later one just set.
    expect(ui.sent).toHaveLength(1);
    expect(ui.sent[0]).toEqual({ ...ALL_ON, is_visible_on_pos: false });
  });

  it("keeps the user's last toggle when the requests complete in reverse order", async () => {
    const ui = mountControls();

    ui.toggle("POS");
    ui.toggle("Kiosk");

    // Both switches already show the user's intent, unconfirmed.
    expect(ui.shown()).toEqual({
      is_visible_on_pos: false,
      is_visible_on_kiosk: false,
      is_visible_online: true,
    });

    await ui.landNewestFirst();

    const intended: MenuChannelVisibility = {
      is_visible_on_pos: false,
      is_visible_on_kiosk: false,
      is_visible_online: true,
    };

    // Whatever order the responses come back in, the state that ends up on the
    // server is the last thing the user asked for — not an earlier write
    // arriving late and reviving the channel they just turned off.
    expect(ui.server.state).toEqual(intended);
    expect(ui.shown()).toEqual(intended);
    expect(ui.sent).toHaveLength(2);
    expect(ui.sent[1]).toEqual(intended);
  });

  it("does not bounce the queued toggle back while the earlier write lands", async () => {
    const ui = mountControls();

    ui.toggle("POS");
    ui.toggle("Kiosk");

    // The first write completes, and its refetch pushes a value in which Kiosk
    // is still on. The queued toggle must survive that.
    await act(async () => {
      ui.inFlight.shift()!.land();
    });

    expect(ui.shown().is_visible_on_kiosk).toBe(false);

    await ui.landNewestFirst();
    expect(ui.shown().is_visible_on_kiosk).toBe(false);
  });

  it("rolls back to the server value and drops the queued tail when a write fails", async () => {
    const ui = mountControls({ failWrite: 0 });

    ui.toggle("POS");
    ui.toggle("Kiosk");

    await ui.landNewestFirst();

    expect(ui.shown()).toEqual(ALL_ON);
    expect(ui.server.state).toEqual(ALL_ON);
    // The queued toggle was built on top of the write that failed, so it is
    // dropped rather than replayed against the rolled-back value.
    expect(ui.sent).toHaveLength(1);
  });

  it("lets an edit from elsewhere supersede a settled override", async () => {
    const ui = mountControls();

    ui.toggle("POS");
    await ui.landNewestFirst();
    expect(ui.shown().is_visible_on_pos).toBe(false);

    const elsewhere: MenuChannelVisibility = {
      is_visible_on_pos: true,
      is_visible_on_kiosk: false,
      is_visible_online: true,
    };
    ui.setServerValue(elsewhere);

    expect(ui.shown()).toEqual(elsewhere);
  });
});
