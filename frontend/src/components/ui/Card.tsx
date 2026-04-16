export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/[0.07] rounded-2xl p-4 shadow-sm backdrop-blur-md ${className}`}>
      {title && <h2 className="text-[10px] sm:text-xs uppercase tracking-widest font-semibold text-zinc-500 dark:text-zinc-400 mb-3">{title}</h2>}
      {children}
    </div>
  );
}
