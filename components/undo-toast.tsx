"use client";

export type PendingDeleteToast = {
  id: string;
  ticketNumber: number;
  closing: boolean;
};

export function UndoToastStack({
  toasts,
  onUndo,
}: {
  toasts: PendingDeleteToast[];
  onUndo: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-card border border-rule-2 bg-paper-3 px-4 py-2.5 shadow-card ${
            toast.closing ? "animate-toast-out" : "animate-toast-in"
          }`}
        >
          <span className="text-sm text-ink-2">
            <span className="font-outlier tabular-nums">
              {String(toast.ticketNumber).padStart(3, "0")}
            </span>{" "}
            を削除しました
          </span>
          <button
            type="button"
            onClick={() => onUndo(toast.id)}
            className="whitespace-nowrap text-sm font-semibold text-accent underline decoration-1 underline-offset-2 transition-colors duration-[264ms] ease-out hover:text-accent/80"
          >
            元に戻す
          </button>
        </div>
      ))}
    </div>
  );
}
