/** Red rubber-stamp "PAID / THANK YOU" seal for paid service tickets and special projects. */
export function PaidStamp({ className = "w-24" }: { className?: string }) {
  const red = "#d61f1f";
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Paid. Thank you." className={`shrink-0 -rotate-12 ${className}`}>
      <defs>
        <path id="paid-ring" d="M100,100 m-68,0 a68,68 0 1,1 136,0 a68,68 0 1,1 -136,0" />
      </defs>
      <circle cx="100" cy="100" r="94" fill="none" stroke={red} strokeWidth="6" strokeDasharray="3 2" />
      <circle cx="100" cy="100" r="86" fill="none" stroke={red} strokeWidth="3" />
      <circle cx="100" cy="100" r="54" fill="none" stroke={red} strokeWidth="3" />
      <text fill={red} fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="15" letterSpacing="2">
        <textPath href="#paid-ring" textLength="420" lengthAdjust="spacing">THANK YOU ★ THANK YOU ★ THANK YOU ★</textPath>
      </text>
      <rect x="38" y="78" width="124" height="44" fill="white" stroke={red} strokeWidth="4" />
      <text x="100" y="114" textAnchor="middle" fill={red} fontFamily="Impact, 'Arial Black', Arial, sans-serif" fontWeight="900" fontSize="38" letterSpacing="2">
        PAID
      </text>
      <text x="100" y="66" textAnchor="middle" fill={red} fontSize="14">★ ★ ★</text>
      <text x="100" y="146" textAnchor="middle" fill={red} fontSize="14">★ ★ ★</text>
    </svg>
  );
}
