/**
 * The "ZeroIn" wordmark, set as ZEROın: display font, slanted like the 0in logo, "ın" in the accent colour.
 * The i is dotless (U+0131) because its dot is the cyan dot in the middle of the drawn 0, as in the logo.
 * In running text the name stays "ZeroIn". Inherits font size from its parent.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `wordmark ${className}` : 'wordmark'}>
      <span className="sr-only">ZeroIn</span>
      <span className="wordmark__art" aria-hidden="true">
        ZER<span className="wordmark__o" /><span className="wordmark__in">{'\u0131'}n</span>
      </span>
    </span>
  );
}
