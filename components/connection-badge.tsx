import { Wifi, WifiOff } from "lucide-react";

export function ConnectionBadge({ connected }: { connected: boolean }) {
  const label = connected ? "データ同期" : "同期停止";
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
        connected
          ? "bg-accent/15 text-accent"
          : "bg-danger/15 text-danger"
      }`}
    >
      {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
    </span>
  );
}
