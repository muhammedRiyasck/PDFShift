interface PDFIconProps {
  className?: string;
  /** Size in px — controls width/height of the whole icon */
  size?: number;
}

/**
 * Classic PDF file icon — red body, folded top-right corner, white "PDF" label.
 * Fully scalable via the `size` prop (default 40px).
 */
export default function PDFIcon({ className = "", size = 40 }: PDFIconProps) {
  const fold = size * 0.28; // corner fold size

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PDF file"
    >
      {/* Page body */}
      <path
        d={`M0 4 C0 1.8 1.8 0 4 0 L${40 - fold} 0 L40 ${fold} L40 44 C40 46.2 38.2 48 36 48 L4 48 C1.8 48 0 46.2 0 44 Z`}
        fill="#E53E3E"
      />
      {/* Folded corner triangle (darker red) */}
      <path
        d={`M${40 - fold} 0 L40 ${fold} L${40 - fold} ${fold} Z`}
        fill="#C53030"
      />
      {/* White "PDF" text */}
      <text
        x="20"
        y="31"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="0.5"
      >
        PDF
      </text>
    </svg>
  );
}

