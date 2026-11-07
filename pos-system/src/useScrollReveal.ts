import { useEffect, type RefObject } from 'react';

const REVEAL_SELECTOR = [
  'header',
  'section',
  'article',
  '[class*="grid-cols"] > [class*="rounded"]',
  '[class~="grid"] > [class*="rounded"]',
  '[class*="space-y"] > [class*="rounded-2xl"]',
  '[class*="space-y"] > [class*="rounded-xl"]',
].join(',');

const isDecorativeOrOverlay = (element: HTMLElement) =>
  element.closest('[role="dialog"], [aria-modal="true"], [class*="fixed"]') !== null
  || element.closest('#printable-receipt, #printable-barcode-labels') !== null
  || element.classList.contains('ui-reveal');

/**
 * Adds restrained reveal motion to every workspace page, including content
 * inserted after an API response. Keeping it here means new modules inherit
 * the visual language without each screen owning another animation system.
 */
export const useScrollReveal = (
  rootRef: RefObject<HTMLElement | null>,
  pageKey: string,
) => {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const page = Array.from(root.children).find((child) =>
      child instanceof HTMLElement
      && !child.matches('[role="alert"]')
      && !child.classList.contains('sticky')) as HTMLElement | undefined;

    if (page) {
      page.classList.remove('ui-page-enter');
      // Re-applying on the next frame makes navigation feel continuous even
      // when two views happen to reuse the same outer DOM shape.
      requestAnimationFrame(() => page.classList.add('ui-page-enter'));
    }

    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      page?.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((element) => {
        element.classList.add('ui-reveal', 'ui-reveal-visible');
      });
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).classList.add('ui-reveal-visible');
        observer.unobserve(entry.target);
      });
    }, {
      root,
      threshold: 0.08,
      rootMargin: '0px 0px -5% 0px',
    });

    let frame = 0;
    const register = () => {
      if (!page?.isConnected) return;
      let stagger = 0;
      page.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((element) => {
        if (isDecorativeOrOverlay(element)) return;
        const bounds = element.getBoundingClientRect();
        if (bounds.height < 44 || bounds.width < 120) return;

        element.classList.add('ui-reveal');
        element.style.setProperty('--reveal-delay', `${Math.min(stagger, 5) * 45}ms`);
        stagger = (stagger + 1) % 6;

        const classes = element.className;
        if (typeof classes === 'string'
          && /rounded-(?:xl|2xl|3xl)/.test(classes)
          && /bg-(?:white|slate-9)/.test(classes)
          && !element.querySelector('table')) {
          element.classList.add('ui-surface');
        }
        observer.observe(element);
      });
    };

    const queueRegister = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(register);
    };
    queueRegister();

    const mutations = new MutationObserver(queueRegister);
    mutations.observe(page || root, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
    };
  }, [pageKey, rootRef]);
};
