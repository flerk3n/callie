import { cn } from "@/lib/utils";

type GradientWaveProps = {
  className?: string;
};

export function GradientWave({ className }: GradientWaveProps) {
  return (
    <div className={cn("gradient-wave", className)} aria-hidden="true">
      <svg viewBox="0 0 1440 2640" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id="callie-wave-blue" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#003dff" stopOpacity="0.13" />
            <stop offset="55%" stopColor="#1e59ff" stopOpacity="0.045" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="callie-wave-violet" x1="1" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#b75aff" stopOpacity="0.12" />
            <stop offset="54%" stopColor="#1e59ff" stopOpacity="0.035" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="callie-wave-soft" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#003dff" stopOpacity="0" />
            <stop offset="47%" stopColor="#003dff" stopOpacity="0.055" />
            <stop offset="100%" stopColor="#b75aff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="gradient-wave__path gradient-wave__path--blue"
          d="M-130 270C160 84 388 522 725 342c318-170 485-446 853-251v592H-130Z"
          fill="url(#callie-wave-blue)"
        />
        <path
          className="gradient-wave__path gradient-wave__path--violet"
          d="M-140 905c291-260 500 167 828-5 312-163 526-528 893-323v526H-140Z"
          fill="url(#callie-wave-violet)"
        />
        <path
          className="gradient-wave__path gradient-wave__path--soft"
          d="M-80 1565c265-155 503 262 781 66 328-231 503-345 822-169v360H-80Z"
          fill="url(#callie-wave-soft)"
        />
        <path
          className="gradient-wave__path gradient-wave__path--blue gradient-wave__path--last"
          d="M-90 2272c311-233 493 160 818-21 257-143 498-411 792-274v487H-90Z"
          fill="url(#callie-wave-blue)"
        />
      </svg>
    </div>
  );
}
