export function StatTile({ label, value, accent, trend }: { label: string; value: string | number; accent?: boolean; trend?: number }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-3 text-center transition-all hover:bg-zinc-50 shadow-sm shadow-zinc-200/50">
      <p className="text-[10px] uppercase tracking-wide text-zinc-400 font-bold mb-1 flex items-center justify-center gap-1">
        {label}
        {trend !== undefined && (
          <span className={`text-[10px] ${trend > 0 ? "text-emerald-500" : trend < 0 ? "text-red-500" : "text-zinc-400"}`}>
            {trend > 0 ? "↑" : trend < 0 ? "↓" : "—"} {Math.abs(trend)}%
          </span>
        )}
      </p>
      <p className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${accent ? "text-red-600" : "text-zinc-900"}`}>
        {value}
      </p>
    </div>
  );
}
