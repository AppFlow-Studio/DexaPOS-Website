import { z } from "zod";
import { subtitleSchema, titleSchema } from "../primitives";

/**
 * One embedded video.
 *
 * **A provider and an id, never a URL and never markup.** The obvious shape for
 * this field is "paste your embed code", and it is the wrong one twice over: an
 * `<iframe>` a merchant pastes is arbitrary third-party script on their own
 * public page, and a full URL means parsing every share format YouTube has ever
 * emitted at *render* time, on a page that must not throw.
 *
 * So the parse happens once, in the editor, and what gets stored is the pair the
 * renderer can build a known-good embed URL from. An id that fails this pattern
 * never reaches the document.
 */
export const VIDEO_PROVIDERS = ["youtube", "vimeo"] as const;

export const videoSchema = z.object({
  title: titleSchema.optional(),
  subtitle: subtitleSchema.optional(),
  provider: z.enum(VIDEO_PROVIDERS),
  /**
   * The provider's own id. YouTube's are 11 characters of an unreserved
   * alphabet; Vimeo's are digits. The union of both, conservatively.
   *
   * Empty is allowed: a merchant adds the section, then finds the link. The
   * renderer draws a prompt in the builder and nothing at all in public, which
   * is the same shape every other optional-media section already has. The
   * pattern still refuses anything that is not an id, so an empty string is the
   * only way this can be blank.
   */
  videoId: z
    .string()
    .max(32)
    .regex(/^[A-Za-z0-9_-]*$/, "That does not look like a video id"),
});

export type VideoProps = z.infer<typeof videoSchema>;

export function videoDefaults(): VideoProps {
  return { provider: "youtube", videoId: "" };
}

/**
 * Pulls the id out of whatever a merchant pasted.
 *
 * Lives here rather than in the editor so the rules and the schema cannot
 * disagree, and so a future import tool gets the same parsing. Returns null
 * when nothing usable is found — the caller shows a message rather than storing
 * a guess.
 */
export function parseVideoRef(
  input: string,
): { provider: (typeof VIDEO_PROVIDERS)[number]; videoId: string } | null {
  const value = input.trim();
  if (!value) return null;

  // A bare id, already in the shape we store.
  if (/^[A-Za-z0-9_-]{6,32}$/.test(value) && !value.includes("/")) {
    return { provider: /^\d+$/.test(value) ? "vimeo" : "youtube", videoId: value };
  }

  const youtube = value.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,32})/,
  );
  if (youtube) return { provider: "youtube", videoId: youtube[1] };

  const vimeo = value.match(/vimeo\.com\/(?:video\/)?(\d{6,32})/);
  if (vimeo) return { provider: "vimeo", videoId: vimeo[1] };

  return null;
}

/** The embed URL for a stored pair. Built here, never stored. */
export function videoEmbedUrl(provider: VideoProps["provider"], videoId: string): string {
  return provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : `https://player.vimeo.com/video/${videoId}`;
}
