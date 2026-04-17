export function StatTile({ label, value, color = "bg-white text-zinc-800 border-zinc-100", trend }: { label: string; value: string | number; color?: string; trend?: number }) {
  return (
    <div className={`${color} border rounded-[24px] p-5 shadow-sm shadow-zinc-200/40 relative overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]`}>
      <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 blur-2xl rounded-full translate-x-1/2 -translate-y-1/2" />
      
      <div className="flex justify-between items-start mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">{label}</span>
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black ${trend > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </div>
        )}
      </div>

      <div className="text-2xl font-black tracking-tight flex items-baseline gap-1">
        {value}
      </div>
    </div>
  );
}
