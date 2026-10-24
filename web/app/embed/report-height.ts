"use client";

import { useEffect, type RefObject } from "react";

/**
 * Inside a host page's iframe (the Kaleva mock-up), tell the parent page this element's height so the frame
 * never scrolls. Measures the element, not the body: the body is at least as tall as the frame, so it could
 * never shrink. `ready` lets a page wait until its real content is in place.
 */
export function useReportHeight(ref: RefObject<HTMLElement | null>, ready = true) {
  useEffect(() => {
    const el = ref.current;
    if (window.parent === window || !ready || !el) return;
    const report = () =>
      window.parent.postMessage({ type: "stakes:height", height: el.getBoundingClientRect().height }, window.location.origin);
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, ready]);
}
