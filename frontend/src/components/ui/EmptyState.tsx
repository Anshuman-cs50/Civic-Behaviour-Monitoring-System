import { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, message, description }: { icon: LucideIcon; message: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[160px] animate-in fade-in duration-500">
      <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
      </div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{message}</p>
      {description && <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 max-w-[200px] mx-auto">{description}</p>}
    </div>
  );
}
