"use client";

import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ArchiveEvent, CreateEvent, UpdateEvent } from "@/app/dashboard/website/actions/events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  EVENT_DESCRIPTION_MAX,
  EVENT_NAME_MAX,
  EVENT_REPEATS,
  REPEAT_LABELS,
  formatDateValue,
  formatOccurrence,
  nextOccurrence,
  type EventInput,
  type EventRepeat,
} from "@/lib/site-builder/events/event";
import type { RenderEvent } from "@/lib/site-builder/events/event-map";
import { cn } from "@/lib/utils";
import AssetPicker from "../builder/AssetPicker";
import DataCard from "../shell/DataCard";
import ListHeader from "../shell/ListHeader";

/**
 * The events list, and the modal that creates one.
 *
 * Events are records, so this screen is a table and a form — there is no
 * builder, no canvas and no publish. They reach the website through the
 * `Events` section, which reads them live.
 */
export default function EventsScreen({
  clerkOrgId,
  events,
  locations,
}: {
  clerkOrgId: string;
  events: RenderEvent[];
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RenderEvent | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const archive = (event: RenderEvent) => {
    startTransition(async () => {
      const result = await ArchiveEvent(clerkOrgId, event.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`“${event.name}” removed.`);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <ListHeader
        title="Events"
        subtitle="Manage the events shown on your website."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            New Event
          </Button>
        }
      />

      <DataCard
        items={events}
        getKey={(event) => event.id}
        getSearchText={(event) => `${event.name} ${event.description ?? ""}`}
        columns={["When", "Repeats", ""]}
        gridTemplate="minmax(0,1fr) 230px 110px 40px"
        emptyLabel="No events"
        emptyIcon={CalendarDays}
        renderRow={(event) => {
          const occursOn = nextOccurrence(event);
          return (
            <>
              <button
                type="button"
                onClick={() => setEditing(event)}
                className="flex min-w-0 items-center gap-2 text-left text-sm font-medium hover:underline"
              >
                {event.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- merchant CDN host
                  <img
                    src={event.photoUrl}
                    alt=""
                    className="size-8 shrink-0 rounded object-cover"
                  />
                )}
                <span className="truncate">{event.name}</span>
              </button>

              <span
                className={cn(
                  "truncate text-xs",
                  occursOn ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {/*
                  An event that is over is still listed — a merchant may want to
                  reuse or edit it — but it is labelled, because "why is my
                  event not on my website?" has exactly one answer and this is
                  it.
                */}
                {occursOn ? formatOccurrence(event, occursOn) : "Finished"}
              </span>

              <span className="truncate text-xs text-muted-foreground">
                {event.repeat === "none" ? "—" : REPEAT_LABELS[event.repeat]}
              </span>

              <button
                type="button"
                aria-label={`Remove ${event.name}`}
                disabled={pending}
                onClick={() => archive(event)}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          );
        }}
      />

      {editing && (
        <EventDialog
          key={editing === "new" ? "new" : editing.id}
          clerkOrgId={clerkOrgId}
          event={editing === "new" ? null : editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Create / edit an event.
 *
 * **The photo requirement is shown before it is broken.** Owner validates the
 * photo field on open, red, before the merchant has touched anything — which
 * reads as aggressive until you see what it is communicating: an event without
 * an image looks broken on your website. We say the same thing without
 * colouring an untouched form red: the requirement is stated under the picker,
 * and the submit button is disabled until it is met, so the rule is visible
 * from the first moment without accusing anyone of anything.
 */
function EventDialog({
  clerkOrgId,
  event,
  locations,
  onClose,
  onSaved,
}: {
  clerkOrgId: string;
  event: RenderEvent | null;
  locations: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<EventInput>(() =>
    event
      ? {
          name: event.name,
          description: event.description,
          photoAssetId: event.photoAssetId,
          locationId: event.locationId,
          startDate: event.startDate,
          startTime: event.startTime,
          endTime: event.endTime,
          repeat: event.repeat,
          ticketUrl: event.ticketUrl,
        }
      : {
          name: "",
          photoAssetId: "",
          locationId: locations[0]?.id ?? null,
          startDate: formatDateValue(new Date()),
          // Restaurant-shaped: 11pm to 2am is when a restaurant's events
          // actually happen, and it saves two interactions on the common case.
          startTime: DEFAULT_START_TIME,
          endTime: DEFAULT_END_TIME,
          repeat: "none",
        },
  );
  const [showTicket, setShowTicket] = useState(Boolean(event?.ticketUrl));
  const [pending, startTransition] = useTransition();

  const patch = (next: Partial<EventInput>) => setDraft((current) => ({ ...current, ...next }));

  const ready = draft.name.trim().length > 0 && draft.photoAssetId.length > 0;

  const save = () => {
    startTransition(async () => {
      const result = event
        ? await UpdateEvent(clerkOrgId, event.id, draft)
        : await CreateEvent(clerkOrgId, draft);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(event ? "Event updated." : "Event added.");
      onSaved();
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "Create new event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <AssetPicker
              label="Photo"
              clerkOrgId={clerkOrgId}
              value={draft.photoAssetId ? { assetId: draft.photoAssetId } : undefined}
              onChange={(value) => patch({ photoAssetId: value?.assetId ?? "" })}
            />
            <p
              className={cn(
                "mt-1.5 text-[11px] leading-relaxed",
                draft.photoAssetId ? "text-muted-foreground" : "text-destructive",
              )}
            >
              Required — an event with no photo looks unfinished beside the others on your site.
            </p>
          </div>

          <Field label="Name">
            <Input
              autoFocus
              value={draft.name}
              maxLength={EVENT_NAME_MAX}
              placeholder="Friday Trivia Night"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>

          <Field label="Description" optional>
            <textarea
              rows={3}
              value={draft.description ?? ""}
              maxLength={EVENT_DESCRIPTION_MAX}
              onChange={(e) => patch({ description: e.target.value || undefined })}
              className={INPUT_CLASS}
            />
          </Field>

          {locations.length > 0 && (
            <Field label="Location">
              <select
                value={draft.locationId ?? ""}
                onChange={(e) => patch({ locationId: e.target.value || null })}
                className={INPUT_CLASS}
              >
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Start date">
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => patch({ startDate: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                value={draft.startTime}
                onChange={(e) => patch({ startTime: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) => patch({ endTime: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
          </div>

          {draft.endTime <= draft.startTime && (
            <p className="text-[11px] text-muted-foreground">
              Ends the following morning.
            </p>
          )}

          <Field label="Repeat">
            <select
              value={draft.repeat}
              onChange={(e) => patch({ repeat: e.target.value as EventRepeat })}
              className={INPUT_CLASS}
            >
              {EVENT_REPEATS.map((repeat) => (
                <option key={repeat} value={repeat}>
                  {REPEAT_LABELS[repeat]}
                </option>
              ))}
            </select>
          </Field>

          {showTicket ? (
            <Field label="Ticket link" optional>
              <Input
                type="url"
                value={draft.ticketUrl ?? ""}
                placeholder="https://eventbrite.com/e/…"
                onChange={(e) => patch({ ticketUrl: e.target.value || undefined })}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                We link out to your ticketing — we don&rsquo;t sell tickets.
              </p>
            </Field>
          ) : (
            <button
              type="button"
              onClick={() => setShowTicket(true)}
              className="text-xs font-medium underline underline-offset-2"
            >
              Add ticket link
            </button>
          )}
        </div>

        <DialogFooter>
          <Button disabled={!ready || pending} onClick={save}>
            {pending ? "Saving…" : event ? "Save changes" : "Add Event"}
            <Plus className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">optional</span>}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
