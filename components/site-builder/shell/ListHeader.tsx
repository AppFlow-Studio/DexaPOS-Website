/**
 * The heading every screen in the Website group opens with.
 *
 * A title, one sentence saying what the screen is for, and the actions — at
 * most one secondary and one primary, right-aligned. Deliberately not a card
 * and deliberately not decorated: it is the same shape on Pages, Forms, Events
 * and Careers, so the merchant reads it once and then stops reading it.
 */
export default function ListHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
