import { Wifi, WifiOff } from "lucide-react";

export function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium ${
        connected
          ? "bg-accent/15 text-accent"
          : "bg-danger/15 text-danger"
      }`}
    >
      {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
      {connected ? "接続中" : "切断"}
    </span>
  );
}
