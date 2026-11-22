import { cn } from "@/shared/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface flex flex-col items-start gap-3 px-6 py-10 animate-fade-up",
        className,
      )}
    >
      <h3 className="text-lg font-medium text-ink-900">{title}</h3>
      {description ? <p className="font-ui max-w-lg text-sm text-stone-500">{description}</p> : null}
      {action}
    </div>
  );
}
