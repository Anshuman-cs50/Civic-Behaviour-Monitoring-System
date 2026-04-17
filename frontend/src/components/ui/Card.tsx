export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/70 backdrop-blur-xl border border-white/40 rounded-[28px] p-6 shadow-xl shadow-zinc-200/50 relative overflow-hidden group transition-all hover:shadow-2xl hover:shadow-indigo-500/5 ${className}`}>
      {/* Subtle top light effect */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {title && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{title}</h2>
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/20" />
        </div>
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
