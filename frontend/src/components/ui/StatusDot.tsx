export function StatusDot({ ok, label, state = "idle" }: { ok?: boolean; label: string; state?: "active" | "error" | "idle" }) {
  // Can either use explicit state or boolean `ok`
  const isActive = state === "active" || ok === true;
  const isError = state === "error" || ok === false;
  
  let dotColor = "bg-zinc-300 dark:bg-zinc-600";
  if (isActive) dotColor = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
  if (isError) dotColor = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";

  return (
    <span className="flex items-center gap-2 text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400">
      <span className={`w-2 h-2 rounded-full ${dotColor} transition-colors duration-300`} />
      {label}
    </span>
  );
}
