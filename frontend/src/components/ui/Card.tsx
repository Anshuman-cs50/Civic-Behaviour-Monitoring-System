export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm backdrop-blur-md ${className}`}>
      {title && <h2 className="text-[10px] sm:text-xs uppercase tracking-widest font-bold text-zinc-400 mb-3">{title}</h2>}
      {children}
    </div>
  );
}
