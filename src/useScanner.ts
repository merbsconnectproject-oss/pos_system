import { useEffect, useRef } from 'react';

/**
 * Global barcode scanner capture — FR-POS-03 … FR-POS-06.
 *
 * A USB scanner behaves as a keyboard: it "types" the code far faster than a
 * person can and terminates with Enter. The detection logic lives in the pure
 * `createScanDetector` below so it can be tested without a DOM; the hook is a
 * thin wrapper that feeds it window keydown events and drains the scan queue.
 */

/** A person typing fast still averages well above this between keystrokes. */
export const MAX_SCAN_INTERVAL_MS = 55;
/** Gap after which the buffer is a new entry rather than a continuation. */
export const IDLE_RESET_MS = 300;
/** Shorter than this is far more likely to be typing than a barcode. */
export const MIN_SCAN_LENGTH = 4;

export interface ScanDetector {
  /**
   * Feed one keystroke. Returns the completed code when this keystroke ends a
   * scan, or null otherwise. `key` is the KeyboardEvent.key value.
   */
  push: (key: string, timestamp: number) => string | null;
  reset: () => void;
}

export function createScanDetector(): ScanDetector {
  let buffer = '';
  let intervals: number[] = [];
  let lastKeyAt = 0;

  const reset = () => {
    buffer = '';
    intervals = [];
  };

  return {
    reset,
    push(key, timestamp) {
      const gap = lastKeyAt === 0 ? Number.POSITIVE_INFINITY : timestamp - lastKeyAt;
      lastKeyAt = timestamp;

      if (key === 'Enter') {
        const code = buffer;
        const seen = intervals;
        reset();
        if (code.length < MIN_SCAN_LENGTH || seen.length === 0) return null;

        // Median rather than mean: one stray slow keystroke should not
        // disqualify an otherwise machine-speed burst.
        const sorted = [...seen].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        return median <= MAX_SCAN_INTERVAL_MS ? code : null;
      }

      // Only printable single characters form a barcode.
      if (key.length !== 1) return null;

      if (gap > IDLE_RESET_MS) {
        buffer = key;
        intervals = [];
        return null;
      }

      buffer += key;
      intervals.push(gap);
      return null;
    },
  };
}

interface ScannerOptions {
  /** Called once per scan, with the raw code. */
  onScan: (code: string) => void;
  /**
   * When false the listener detaches entirely — used for the payment modal,
   * which FR-PAY-08 makes the one modal permitted to block scanner input.
   */
  enabled: boolean;
}

export function useScanner({ onScan, enabled }: ScannerOptions) {
  const detectorRef = useRef<ScanDetector | null>(null);
  const queueRef = useRef<string[]>([]);
  const drainingRef = useRef(false);
  // Kept in a ref so the listener never closes over a stale callback.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      detectorRef.current?.reset();
      return;
    }
    const detector = createScanDetector();
    detectorRef.current = detector;

    // FR-POS-06: a burst of scans is queued and drained so none are dropped.
    const drain = () => {
      if (drainingRef.current) return;
      drainingRef.current = true;
      try {
        while (queueRef.current.length > 0) {
          const code = queueRef.current.shift();
          if (code) onScanRef.current(code);
        }
      } finally {
        drainingRef.current = false;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const code = detector.push(event.key, Date.now());
      if (!code) return;
      // It was a scan: claim the Enter so the focused form does not also submit.
      event.preventDefault();
      queueRef.current.push(code);
      drain();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);
}
