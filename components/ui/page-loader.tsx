interface PageLoaderProps {
  message?: string;
  /** Use "fill" when inside a bounded container (e.g. h-96 card). Default is "page" (py-20). */
  variant?: "page" | "fill";
}

export function PageLoader({ message = "Loading...", variant = "page" }: PageLoaderProps) {
  const containerClass =
    variant === "fill"
      ? "w-full h-full flex flex-col items-center justify-center gap-3"
      : "flex flex-col items-center justify-center py-20 gap-3";

  return (
    <div className={containerClass}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <span className="text-muted-foreground text-sm font-medium">{message}</span>
    </div>
  );
}
