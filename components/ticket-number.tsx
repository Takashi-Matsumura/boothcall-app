import { formatTicketNumber } from "@/lib/types";

export function TicketNumber({
  number,
  className = "",
}: {
  number: number;
  className?: string;
}) {
  return (
    <span className={`font-outlier tabular-nums ${className}`}>
      {formatTicketNumber(number)}
    </span>
  );
}
