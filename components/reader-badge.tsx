import { CreditCard, Unplug } from "lucide-react";
import type { ReaderStatus } from "@/lib/types";

const CONFIG: Record<
  ReaderStatus,
  { icon: typeof CreditCard; label: string; className: string }
> = {
  connected: {
    icon: CreditCard,
    label: "リーダー接続",
    className: "bg-accent/15 text-accent",
  },
  disconnected: {
    icon: Unplug,
    label: "リーダー未接続",
    className: "bg-danger/15 text-danger",
  },
  unavailable: {
    icon: CreditCard,
    label: "NFC無効",
    className: "bg-paper-3 text-muted",
  },
};

export function ReaderBadge({ status }: { status: ReaderStatus }) {
  const { icon: Icon, label, className } = CONFIG[status];
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${className}`}
    >
      <Icon size={16} />
    </span>
  );
}
