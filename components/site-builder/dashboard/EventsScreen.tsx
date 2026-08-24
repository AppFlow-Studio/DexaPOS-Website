"use client";

import { CalendarDays, Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ArchiveEvent, CreateEvent, UpdateEvent } from "@/app/dashboard/website/actions/events";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Radix refuses an empty item value; "every branch" needs a name of its own. */
const ALL_LOCATIONS = "__all__";
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
        columns={["When", "Repeats", "Remove"]}
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

              {/*
                Confirmed, unlike a section delete — which has an Undo toast to
                fall back on. Removing an event here has no undo at all, and
                the control is a bare icon at the end of a row that is otherwise
                entirely clickable.
              */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Remove ${event.name}`}
                    disabled={pending}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove “{event.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      It comes off your website straight away, and any Events section showing it
                      moves on to the next one. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction onClick={() => archive(event)}>
                      Remove the event
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
          {/*
            The requirement is stated once, and only while it is unmet. It used
            to sit permanently under a filled picker whose own Remove button was
            directly above it, so the screen said "Required" and offered to
            remove the required thing in the same breath.
          */}
          <div>
            <AssetPicker
              label="Photo"
              clerkOrgId={clerkOrgId}
              value={draft.photoAssetId ? { assetId: draft.photoAssetId } : undefined}
              onChange={(value) => patch({ photoAssetId: value?.assetId ?? "" })}
            />
            {!draft.photoAssetId && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-destructive">
                A photo is required — an event without one looks unfinished beside the others on
                your site.
              </p>
            )}
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
              <Select
                value={draft.locationId ?? ALL_LOCATIONS}
                onValueChange={(value) =>
                  patch({ locationId: value === ALL_LOCATIONS ? null : value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Select
              value={draft.repeat}
              onValueChange={(value) => patch({ repeat: value as EventRepeat })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_REPEATS.map((repeat) => (
                  <SelectItem key={repeat} value={repeat}>
                    {REPEAT_LABELS[repeat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {/* A plus means "one more of these"; saving an edit does not add
                anything. The icon follows the verb. */}
            {event ? <Check className="size-4" /> : <Plus className="size-4" />}
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
