export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="12" fill="none" stroke="currentColor" strokeOpacity="0.25" />
        <path
          d="M14 46V18h16.5c6.6 0 11 4 11 9.8 0 4.4-2.5 7.7-6.6 9.1L43 46h-9.2l-7-8.3H22.5V46H14Zm8.5-15h7.3c2.6 0 4.2-1.4 4.2-3.3s-1.6-3.2-4.2-3.2h-7.3V31Z"
          fill="var(--color-volt)"
        />
        <circle cx="47" cy="17" r="4" fill="var(--color-volt)">
          <animate attributeName="opacity" values="1;0.25;1" dur="2.4s" repeatCount="indefinite" />
        </circle>
      </svg>
      <span className="font-display text-lg font-bold tracking-[0.28em] text-white">
        RELAY
      </span>
    </span>
  );
}
