export function StatusDot({ ok, label, state = "idle" }: { ok?: boolean; label: string; state?: "active" | "error" | "idle" }) {
  // Can either use explicit state or boolean `ok`
  const isActive = state === "active" || ok === true;
  const isError = state === "error" || ok === false;
  
  let dotColor = "bg-zinc-300";
  if (isActive) dotColor = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]";
  if (isError) dotColor = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]";

  return (
    <span className="flex items-center gap-2 text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-tighter">
      <span className={`w-2 h-2 rounded-full ${dotColor} transition-colors duration-300`} />
      {label}
    </span>
  );
}
