"use client";

import { Volume2, VolumeX } from "lucide-react";

export function SoundToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium transition-colors duration-[264ms] ease-out active:translate-y-px ${
        enabled
          ? "bg-accent-2/15 text-accent-2"
          : "bg-neutral/15 text-neutral"
      }`}
    >
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
      {enabled ? "音声 ON" : "音声 OFF"}
    </button>
  );
}
