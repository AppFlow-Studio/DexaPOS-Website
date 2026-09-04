// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AvailabilitySlot, BookableLocation } from "@/lib/site-builder/reservations/protocol";

import ReservationWidget from "../ReservationWidget";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DINNER = "11111111-1111-1111-1111-111111111111";
const LUNCH = "22222222-2222-2222-2222-222222222222";

const BRANCH: BookableLocation = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "Uptown",
  address: null,
  timezone: "UTC",
  phone: null,
  bookingPolicy: null,
  collectBirthday: false,
  largePartyPhone: null,
  cancellationCutoffMin: 60,
  minPartySize: 1,
  maxPartySize: 8,
  maxAdvanceDays: 60,
};

function slot(time: string, servicePeriodId: string, serviceName: string): AvailabilitySlot {
  return { time, servicePeriodId, serviceName };
}

const mounted: { root: ReturnType<typeof createRoot>; container: HTMLDivElement }[] = [];

/** Mounts the widget with availability already answered, and settles the fetch. */
async function renderWithSlots(slots: AvailabilitySlot[]): Promise<HTMLDivElement> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, slots }) })),
  );

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });

  await act(async () => {
    root.render(
      <ReservationWidget
        siteId="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
        locationId={BRANCH.id}
        locations={[BRANCH]}
        multiBranch={false}
        approvalMode="auto"
        basePath=""
        venueName="Uptown"
        showDetails={false}
        showOtherDates
        renderMode="live"
      />,
    );
  });

  return container;
}

function headings(container: HTMLDivElement): string[] {
  return [...container.querySelectorAll("h4")].map((h) => h.textContent?.trim() ?? "");
}

function slotLabels(container: HTMLDivElement): string[] {
  return [...container.querySelectorAll("ul button")].map((b) => b.textContent?.trim() ?? "");
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("booking grid grouping", () => {
  it("heads each service when a day has more than one", async () => {
    const container = await renderWithSlots([
      slot("12:00", LUNCH, "Lunch"),
      slot("12:15", LUNCH, "Lunch"),
      slot("19:00", DINNER, "Dinner"),
    ]);

    expect(headings(container)).toEqual(["Lunch", "Dinner"]);
    expect(slotLabels(container)).toEqual(["12:00 PM", "12:15 PM", "7:00 PM"]);
  });

  /**
   * The common case: `DEFAULT_SERVICE_PERIOD` gives every merchant exactly one
   * service, and a lone "DINNER" bar under a section already titled "Book a
   * table" is noise.
   */
  it("shows no heading when there is only one service", async () => {
    const container = await renderWithSlots([
      slot("19:00", DINNER, "Dinner"),
      slot("19:15", DINNER, "Dinner"),
    ]);

    expect(headings(container)).toEqual([]);
    expect(slotLabels(container)).toEqual(["7:00 PM", "7:15 PM"]);
  });

  it("no longer repeats the service name inside every chip", async () => {
    const container = await renderWithSlots([
      slot("19:00", DINNER, "Dinner"),
      slot("19:15", DINNER, "Dinner"),
    ]);

    expect(container.textContent).not.toContain("Dinner");
  });
});

/*
  The pickers are buttons that open a panel PORTALLED to `document.body`, so the
  panel is never inside the widget's own container — every query for an open
  panel goes through `document`, not the container.
*/
function trigger(container: HTMLDivElement, label: string): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** The open panel's option rows, in order. */
function optionLabels(): string[] {
  return [...document.querySelectorAll('[role="listbox"] button')].map(
    (b) => b.textContent?.trim() ?? "",
  );
}

/** The option row currently painted as chosen. */
function selectedOption(): string | null {
  const el = document.querySelector('[role="option"][aria-selected="true"] button');
  return el?.textContent?.trim() ?? null;
}

async function pickOption(text: string) {
  const el = [...document.querySelectorAll('[role="listbox"] button')].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!el) throw new Error(`no option "${text}" — have: ${optionLabels().join(", ")}`);
  await click(el);
}

describe("time filter", () => {
  it("offers only hours that actually have a table", async () => {
    const container = await renderWithSlots([
      slot("12:00", LUNCH, "Lunch"),
      slot("19:00", DINNER, "Dinner"),
      slot("20:00", DINNER, "Dinner"),
    ]);

    await click(trigger(container, "Time")!);

    expect(optionLabels()).toEqual(["All Times", "12 PM", "7 PM", "8 PM"]);
  });

  it("narrows the grid to an hour either side of the chosen time", async () => {
    const container = await renderWithSlots([
      slot("12:00", LUNCH, "Lunch"),
      slot("18:00", DINNER, "Dinner"),
      slot("19:00", DINNER, "Dinner"),
      slot("20:00", DINNER, "Dinner"),
      slot("21:00", DINNER, "Dinner"),
    ]);

    await click(trigger(container, "Time")!);
    await pickOption("7 PM");

    expect(slotLabels(container)).toEqual(["6:00 PM", "7:00 PM", "8:00 PM"]);
  });

  it("closes the panel once a time is chosen and shows it on the trigger", async () => {
    const container = await renderWithSlots([
      slot("12:00", LUNCH, "Lunch"),
      slot("19:00", DINNER, "Dinner"),
    ]);

    await click(trigger(container, "Time")!);
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    await pickOption("7 PM");

    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger(container, "Time")!.textContent).toContain("7 PM");
  });

  it("marks the current choice as selected when reopened", async () => {
    const container = await renderWithSlots([
      slot("12:00", LUNCH, "Lunch"),
      slot("19:00", DINNER, "Dinner"),
    ]);

    await click(trigger(container, "Time")!);
    expect(selectedOption()).toBe("All Times");

    await pickOption("7 PM");
    await click(trigger(container, "Time")!);

    expect(selectedOption()).toBe("7 PM");
  });

  /** Filtering away a whole service must take its heading with it. */
  it("drops a service that the filter emptied", async () => {
    const container = await renderWithSlots([
      slot("12:00", LUNCH, "Lunch"),
      slot("19:00", DINNER, "Dinner"),
    ]);

    expect(headings(container)).toEqual(["Lunch", "Dinner"]);

    await click(trigger(container, "Time")!);
    await pickOption("7 PM");

    expect(headings(container)).toEqual([]);
    expect(slotLabels(container)).toEqual(["7:00 PM"]);
  });

  /**
   * Every hour offered is an hour that has a table, so the window around it
   * always contains at least the slot that put it in the list. There is no
   * "narrowed to nothing" state to handle.
   */
  it("always leaves at least one table when an offered hour is chosen", async () => {
    const container = await renderWithSlots([
      slot("12:00", LUNCH, "Lunch"),
      slot("19:00", DINNER, "Dinner"),
    ]);

    await click(trigger(container, "Time")!);
    const hours = optionLabels().filter((l) => l !== "All Times");
    await click(trigger(container, "Time")!);

    for (const hour of hours) {
      await click(trigger(container, "Time")!);
      await pickOption(hour);
      expect(slotLabels(container).length).toBeGreaterThan(0);
    }
  });

  /**
   * A filter the new day cannot honour has to resolve visibly. Correcting it
   * during render rather than in an effect is what stops the grid emptying for
   * a pass underneath a picker still naming the old hour.
   */
  it("falls back to All Times when the new day has no such hour", async () => {
    const days: AvailabilitySlot[][] = [
      [slot("19:00", DINNER, "Dinner"), slot("20:00", DINNER, "Dinner")],
      [slot("12:00", LUNCH, "Lunch"), slot("13:00", LUNCH, "Lunch")],
    ];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, slots: days[Math.min(call++, days.length - 1)] }),
      })),
    );

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    await act(async () => {
      root.render(
        <ReservationWidget
          siteId="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
          locationId={BRANCH.id}
          locations={[BRANCH]}
          multiBranch={false}
          approvalMode="auto"
          basePath=""
          venueName="Uptown"
          showDetails={false}
          showOtherDates
          renderMode="live"
        />,
      );
    });

    await click(trigger(container, "Time")!);
    await pickOption("8 PM");
    expect(trigger(container, "Time")!.textContent).toContain("8 PM");

    // A different date reloads the grid; 8 PM does not exist on the new day.
    await click(trigger(container, "Date")!);
    const days_ = [...document.querySelectorAll("td button")] as HTMLButtonElement[];
    const nextDay = days_.filter((b) => !b.disabled).at(-1)!;
    await click(nextDay);

    expect(trigger(container, "Time")!.textContent).toContain("All Times");
    expect(slotLabels(container)).toEqual(["12:00 PM", "1:00 PM"]);
  });

  it("hides the filter when there is nothing to narrow", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    expect(trigger(container, "Time")).toBeNull();
  });
});

describe("date picker", () => {
  it("shows the chosen day on the trigger, not a raw ISO date", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    // e.g. "Sun, Aug 30" — never "2026-08-30" or "08/30/2026".
    expect(trigger(container, "Date")!.textContent).toMatch(/[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}/);
  });

  it("cannot offer a day before today", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    await click(trigger(container, "Date")!);

    const today = new Date();
    const todayNum = String(today.getDate());
    const cells = [...document.querySelectorAll("td button")] as HTMLButtonElement[];
    const enabled = cells.filter((b) => !b.disabled).map((b) => Number(b.textContent));

    // Every enabled day in the current month is today or later.
    expect(Math.min(...enabled)).toBe(Number(todayNum));
  });

  it("cannot step back past the current month", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    await click(trigger(container, "Date")!);

    const back = document.querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')!;
    expect(back.disabled).toBe(true);
  });

  it("closes once a day is picked", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    await click(trigger(container, "Date")!);
    expect(document.querySelector("td button")).not.toBeNull();

    const enabled = ([...document.querySelectorAll("td button")] as HTMLButtonElement[]).find(
      (b) => !b.disabled,
    )!;
    await click(enabled);

    expect(document.querySelector("td button")).toBeNull();
  });
});

describe("guests picker", () => {
  it("offers the branch's own range plus one past the maximum", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    await click(trigger(container, "Guests")!);

    // BRANCH seats 1–8, so the last entry is the "call us" overflow.
    expect(optionLabels().at(0)).toBe("1 Guest");
    expect(optionLabels().at(-1)).toBe("9+ Guests");
  });

  it("puts the chosen party size on the trigger", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    expect(trigger(container, "Guests")!.textContent).toContain("2 Guests");

    await click(trigger(container, "Guests")!);
    await pickOption("4 Guests");

    expect(trigger(container, "Guests")!.textContent).toContain("4 Guests");
  });
});

describe("picker dismissal", () => {
  it("closes on Escape", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    await click(trigger(container, "Guests")!);
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("closes when the pointer goes down outside it", async () => {
    const container = await renderWithSlots([slot("19:00", DINNER, "Dinner")]);
    await click(trigger(container, "Guests")!);

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("opens only one panel at a time", async () => {
    const container = await renderWithSlots([
      slot("12:00", LUNCH, "Lunch"),
      slot("19:00", DINNER, "Dinner"),
    ]);

    await click(trigger(container, "Guests")!);
    await click(trigger(container, "Time")!);

    expect(document.querySelectorAll('[role="listbox"]')).toHaveLength(1);
  });
});
