import { useEffect } from 'react';

/** Scrolls to an element and flashes it; waits a few frames for it to render. */
function highlight(elementId: string, tries = 10) {
  requestAnimationFrame(() => {
    const el = document.getElementById(elementId);
    if (!el) {
      if (tries > 0) highlight(elementId, tries - 1);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
  });
}

/**
 * Shows the item picked in the What's new pop-up, once. `show` opens it, or
 * returns the id of the element to scroll to.
 */
export function useFocus<T>(focus: T | undefined, onFocused: (() => void) | undefined, show: (id: T) => string | void) {
  useEffect(() => {
    if (focus === undefined) return;
    const elementId = show(focus);
    onFocused?.();
    if (elementId) highlight(elementId);
  }, [focus]);
}
