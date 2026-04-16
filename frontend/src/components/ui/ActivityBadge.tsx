import { ACTIVITY_COLOURS } from "@/lib/constants";

export function ActivityBadge({ activity, confidence }: { activity: string; confidence?: number }) {
  const colourHex = ACTIVITY_COLOURS[activity.toLowerCase()] || ACTIVITY_COLOURS.normal;
  
  // A simplistic way to generate a semi-transparent background from a hex colour in Tailwind manually is hard.
  // Instead, since ACTIVITY_COLOURS might be hex, we will use an inline style for the exact match,
  // or rely on predefined tailwind classes if we update constants. 
  // For now, let's use the hex via style property for perfect accuracy.

  return (
    <span 
      className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold capitalize border"
      style={{
        color: colourHex,
        borderColor: `${colourHex}40`, // 25% opacity border
        backgroundColor: `${colourHex}15` // ~8% opacity bg
      }}
    >
      {activity.replace(/_/g, " ")} {confidence ? `(${(confidence * 100).toFixed(0)}%)` : ""}
    </span>
  );
}
