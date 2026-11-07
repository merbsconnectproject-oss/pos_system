/**
 * The counter itself — a terminal, a card reader and a receipt.
 *
 * Drawn rather than photographed, for two reasons. The counter PC runs offline
 * (NFR-4), so an illustration that is part of the bundle cannot fail to load
 * the way a remote image would; and vectors stay sharp on the 1366×768 panels
 * these tills actually ship with.
 *
 * Deliberately generic. Nothing here is a cable drum, a socket or a length of
 * conduit: the same screen greets a pharmacy, a boutique and a hardware shop,
 * and a picture of one trade tells the other two they bought the wrong system.
 * The only things depicted are the ones every counter has.
 *
 * The accent is the configured brand colour (FR-SET-01), so the artwork follows
 * whatever the shop chose rather than pinning a second palette against it.
 */
export function PosTerminalArt({
  accentColor,
  className = '',
}: {
  accentColor: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 520 380"
      className={className}
      fill="none"
      role="img"
      aria-label="A point-of-sale terminal with a card reader and a printed receipt"
    >
      {/* The counter it all stands on — a single soft line, so the objects read
          as sitting on something without a drawn table competing with them. */}
      <ellipse cx="270" cy="318" rx="215" ry="16" fill="currentColor" opacity="0.06" />
      <path d="M40 318h460" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round" />

      {/* ---- the receipt, curling out from behind the terminal ---- */}
      <g transform="rotate(-7 74 232)">
        <path
          d="M46 158h58v128l-7.25 8-7.25-8-7.25 8-7.25-8-7.25 8-7.25-8-7.25 8-7.25-8z"
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeOpacity="0.3"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* The shop's name, then the lines of a sale. */}
        <rect x="58" y="172" width="34" height="5" rx="2.5" fill={accentColor} opacity="0.85" />
        {[190, 202, 214, 226].map((y) => (
          <rect key={y} x="58" y={y} width="34" height="3" rx="1.5" fill="currentColor" opacity="0.32" />
        ))}
        <rect x="58" y="242" width="34" height="4" rx="2" fill="currentColor" opacity="0.5" />
        {/* FR-RCPT-01: the barcode is on the slip, so it is on the picture of one. */}
        {[0, 4, 7, 12, 15, 21, 25, 28, 32].map((offset, index) => (
          <rect
            key={offset}
            x={58 + offset}
            y="258"
            width={index % 3 === 0 ? 2.5 : 1.5}
            height="14"
            fill="currentColor"
            opacity="0.45"
          />
        ))}
      </g>

      {/* ---- the terminal ---- */}
      <g>
        {/* Stand: a foot and a neck, so the screen is clearly on a counter
            rather than floating. */}
        <rect x="222" y="262" width="20" height="46" rx="6" fill="currentColor" opacity="0.18" />
        <rect x="180" y="300" width="104" height="14" rx="7" fill="currentColor" opacity="0.26" />

        <rect
          x="104" y="70" width="256" height="196" rx="18"
          fill="currentColor" fillOpacity="0.1"
          stroke="currentColor" strokeOpacity="0.35" strokeWidth="2"
        />
        <rect x="120" y="86" width="224" height="150" rx="10" fill="currentColor" fillOpacity="0.07" />

        {/* What is on the screen is a sale in progress: a heading, priced
            lines, and a total that carries the accent because that is the
            figure anybody at a counter is looking for. */}
        <rect x="134" y="100" width="74" height="10" rx="5" fill={accentColor} />
        <rect x="292" y="100" width="36" height="10" rx="5" fill="currentColor" opacity="0.22" />

        {[126, 152, 178].map((y) => (
          <g key={y}>
            <rect x="134" y={y} width="104" height="8" rx="4" fill="currentColor" opacity="0.26" />
            <rect x="272" y={y} width="56" height="8" rx="4" fill="currentColor" opacity="0.42" />
          </g>
        ))}

        <rect x="134" y="204" width="194" height="2" rx="1" fill="currentColor" opacity="0.2" />
        <rect x="134" y="214" width="62" height="12" rx="6" fill="currentColor" opacity="0.5" />
        <rect x="250" y="210" width="78" height="20" rx="10" fill={accentColor} />

        {/* The bezel's status light. */}
        <circle cx="232" cy="250" r="3.5" fill={accentColor} opacity="0.8" />
      </g>

      {/* ---- the card reader, in front and to the side ---- */}
      <g transform="rotate(6 428 258)">
        <rect
          x="376" y="186" width="104" height="124" rx="16"
          fill="currentColor" fillOpacity="0.12"
          stroke="currentColor" strokeOpacity="0.35" strokeWidth="2"
        />
        <rect x="392" y="202" width="72" height="30" rx="7" fill="currentColor" fillOpacity="0.16" />
        <rect x="400" y="212" width="34" height="5" rx="2.5" fill="currentColor" opacity="0.45" />
        <rect x="400" y="222" width="22" height="4" rx="2" fill={accentColor} opacity="0.9" />

        {/* Keypad. */}
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2].map((column) => (
            <circle
              key={`${row}-${column}`}
              cx={400 + column * 24}
              cy={250 + row * 16}
              r="5"
              fill="currentColor"
              opacity={row === 3 && column === 1 ? 0.55 : 0.28}
            />
          )),
        )}

        {/* A card in the slot — tapped or inserted, every counter takes one. */}
        <rect
          x="404" y="168" width="70" height="26" rx="5"
          fill={accentColor}
          transform="rotate(-10 439 181)"
        />
        <rect
          x="412" y="176" width="20" height="5" rx="2.5"
          fill="#ffffff" opacity="0.65"
          transform="rotate(-10 439 181)"
        />
      </g>
    </svg>
  );
}
