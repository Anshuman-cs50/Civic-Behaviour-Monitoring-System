export function StatTile({ label, value, accent, trend }: { label: string; value: string | number; accent?: boolean; trend?: number }) {
  return (
    <div className="bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/[0.05] rounded-xl p-3 text-center transition-all hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 flex items-center justify-center gap-1">
        {label}
        {trend !== undefined && (
          <span className={`text-[10px] ${trend > 0 ? "text-emerald-500" : trend < 0 ? "text-red-500" : "text-zinc-400"}`}>
            {trend > 0 ? "↑" : trend < 0 ? "↓" : "—"} {Math.abs(trend)}%
          </span>
        )}
      </p>
      <p className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${accent ? "text-red-500 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}
