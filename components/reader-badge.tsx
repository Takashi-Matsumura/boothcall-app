import { Nfc, Unplug } from "lucide-react";
import type { ReaderStatus } from "@/lib/types";

const CONFIG: Record<
  ReaderStatus,
  { icon: typeof Nfc; label: string; className: string }
> = {
  connected: {
    icon: Nfc,
    label: "リーダー接続",
    className: "bg-accent/15 text-accent",
  },
  disconnected: {
    icon: Unplug,
    label: "リーダー未接続",
    className: "bg-danger/15 text-danger",
  },
  unavailable: {
    icon: Nfc,
    label: "NFC無効",
    className: "bg-paper-3 text-muted",
  },
};

export function ReaderBadge({ status }: { status: ReaderStatus }) {
  const { icon: Icon, label, className } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium ${className}`}
    >
      <Icon size={16} />
      {label}
    </span>
  );
}
