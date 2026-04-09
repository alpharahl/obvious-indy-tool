"use client";

import { useRef, useEffect, useState } from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function NumberInput({ value, onChange, min = 1, max, step = 1, className, style }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [hovered, setHovered] = useState(false);

  // Keep latest value/onChange in refs so the wheel handler never goes stale
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function clamp(v: number) {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  }

  // Non-passive wheel listener so we can preventDefault
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? step : -step;
      onChangeRef.current(clamp(valueRef.current + delta));
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, min, max]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v)) onChange(clamp(v));
  }

  return (
    <input
      ref={ref}
      type="number"
      value={value}
      onChange={handleChange}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      min={min}
      max={max}
      className={className}
      style={{ cursor: hovered ? "ns-resize" : undefined, ...style }}
    />
  );
}
