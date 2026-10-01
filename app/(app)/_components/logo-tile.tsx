// Letter tile with the company's brand colour (Master Brief → Company logos).
// No external logo service is used.
export function LogoTile({ letter, color, size }: { letter: string; color: string; size: 34 | 44 | 48 }) {
  return (
    <span className={`logo logo-${size}`} style={{ background: color }} aria-hidden>
      {letter}
    </span>
  )
}
