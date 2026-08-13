import { lookupLocation } from "@/lib/site-builder/bindings/resolved";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import {
  Container,
  SectionHeading,
  sectionClassName,
  sectionStyleProps,
} from "../section-shell";
import BusinessHours, { formatAddress, mapsSearchUrl } from "./shared/BusinessHours";

/**
 * Address, hours, phone and a map.
 *
 * Everything shown here is live. Decision D6's residual question — should an
 * address edit reach the published site immediately or wait for a republish —
 * is answered *immediately*: an address is a fact about the business, not page
 * content. A merchant who moves premises will not think to republish, and a
 * stale address on a live site is worse than an unexpected update.
 *
 * If the location cannot be resolved the section still renders its heading and
 * whatever copy the merchant wrote, rather than vanishing. A missing address is
 * a gap; a missing section looks like the site is broken.
 */
export default function LocationSection({
  section,
  resolved,
  ctx,
}: SectionRenderProps<"location">) {
  const { heading, subheading, showMap, showHours, showPhone, showDirectionsLink, mapStyle } =
    section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  const result = lookupLocation(resolved, section.props.location.id);
  const location = result.status === "ok" ? result.data : null;
  const address = location ? formatAddress(location) : null;

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style)}
      id="location"
    >
      <Container>
        <SectionHeading
          heading={heading}
          subheading={subheading}
          align={section.style?.align}
          headingAttrs={f("props.heading")}
          subheadingAttrs={f("props.subheading")}
        />

        <div className="grid gap-10 md:grid-cols-2">
          <div className="space-y-6">
            {address ? (
              <address className="not-italic">
                <p className="text-base font-medium">{location!.name}</p>
                <p className="mt-1 text-base leading-relaxed opacity-75">{address}</p>
                {showPhone && location!.phone && (
                  <a
                    href={`tel:${location!.phone.replace(/[^\d+]/g, "")}`}
                    className="mt-3 inline-block text-base font-medium"
                    style={{ color: "var(--site-brand)" }}
                  >
                    {location!.phone}
                  </a>
                )}
              </address>
            ) : (
              ctx.mode === "builder" && (
                <p className="rounded-[var(--site-radius)] border border-dashed p-6 text-sm opacity-70">
                  This section shows your location details automatically. They will appear once
                  this page is connected to a location.
                </p>
              )
            )}

            {showDirectionsLink && address && (
              <a
                href={mapsSearchUrl(location!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: "var(--site-brand)" }}
              >
                Get directions →
              </a>
            )}

            {showHours && location && <BusinessHours businessHours={location.businessHours} />}
          </div>

          {showMap && location?.latitude != null && location?.longitude != null && (
            <div
              className="aspect-[4/3] w-full overflow-hidden rounded-[var(--site-radius)] border"
              style={{ borderColor: "var(--site-border)" }}
            >
              {/*
                An embedded map is a third-party iframe on the merchant's own
                domain, so it is loaded lazily and sandboxed to what it needs.
                `mapStyle` is carried for the future tile-styled provider; the
                current embed does not vary by it.
              */}
              <iframe
                title={`Map showing ${location.name}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full border-0"
                data-map-style={mapStyle}
                src={`https://maps.google.com/maps?q=${location.latitude},${location.longitude}&z=15&output=embed`}
              />
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
