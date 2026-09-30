'use client'
import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from 'react'
import s from '../landing.module.css'

// Scroll reveal from the reference: fades up once when it enters the viewport.
function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setInView(true)
          obs.disconnect()
        }
      },
      { threshold: 0.01 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, inView] as const
}

export function Reveal({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={`${s.reveal} ${inView ? s.revealIn : ''} ${className}`} {...rest}>
      {children}
    </div>
  )
}

/**
 * Observes the container and reveals its children one after another
 * (reference: steps 140ms, plans 160ms, "not another job board" 120ms).
 */
export function RevealGroup({
  className = '',
  stagger,
  children,
}: {
  className?: string
  stagger: number
  children: React.ReactNode
}) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const [shown, setShown] = useState(0)
  const count = Children.count(children)

  useEffect(() => {
    if (!inView) return
    const timers = Array.from({ length: count }, (_, i) => setTimeout(() => setShown(n => Math.max(n, i + 1)), i * stagger))
    return () => timers.forEach(clearTimeout)
  }, [inView, count, stagger])

  return (
    <div ref={ref} className={className}>
      {Children.map(children, (child, i) =>
        isValidElement<{ className?: string }>(child)
          ? cloneElement(child, {
              className: `${child.props.className ?? ''} ${s.reveal} ${i < shown ? s.revealIn : ''}`,
            })
          : child,
      )}
    </div>
  )
}
