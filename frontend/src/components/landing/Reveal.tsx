import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Delay in ms, for staggering items in a row. */
  delay?: number;
}

// A soft "ease-out-quint": fast start, long gentle settle. Reads smoother than plain ease-out.
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Fades and lifts its content in the first time it scrolls into view. */
export default function Reveal({ children, as: Tag = 'div', className = '', delay = 0 }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      setSettled(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Start slightly before the element enters, so the motion is already under way as it appears.
      { rootMargin: '0px 0px 8% 0px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties = settled
    ? {}
    : {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 16px, 0)',
        transition: `opacity 900ms ${EASING} ${delay}ms, transform 900ms ${EASING} ${delay}ms`,
        willChange: visible ? 'auto' : 'opacity, transform',
      };

  return (
    <Tag
      ref={ref}
      style={style}
      // Drop the inline styles once finished so the element is a plain block again (no stacking context).
      onTransitionEnd={(event: React.TransitionEvent) => {
        if (visible && event.target === event.currentTarget && event.propertyName === 'transform') setSettled(true);
      }}
      className={className}
    >
      {children}
    </Tag>
  );
}
