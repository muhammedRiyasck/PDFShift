/**
 * Polyfills for modern ECMAScript features required by pdfjs-dist v6+.
 *
 * Browsers like Samsung Internet (based on Chromium <= 121) and older Firefox Mobile
 * lack native implementations for URL.parse (Chrome 126+) and Promise.withResolvers (Chrome 119+),
 * causing immediate TypeErrors when PDF.js initializes on the main thread.
 */

if (typeof Promise !== "undefined" && typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers !== "function") {
  (Promise as unknown as { withResolvers: <T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void } }).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof Promise !== "undefined" && typeof (Promise as unknown as { try?: unknown }).try !== "function") {
  (Promise as unknown as { try: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> }).try = function (fn, ...args) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

if (typeof URL !== "undefined" && typeof (URL as unknown as { parse?: unknown }).parse !== "function") {
  (URL as unknown as { parse: (url: string, base?: string | URL) => URL | null }).parse = function (url: string, base?: string | URL) {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

if (typeof Object !== "undefined" && typeof (Object as unknown as { groupBy?: unknown }).groupBy !== "function") {
  (Object as unknown as { groupBy: <T, K extends PropertyKey>(items: Iterable<T>, callback: (item: T, index: number) => K) => Record<K, T[]> }).groupBy = function <T, K extends PropertyKey>(
    items: Iterable<T>,
    callback: (item: T, index: number) => K
  ) {
    const result = Object.create(null) as Record<K, T[]>;
    let i = 0;
    for (const item of items) {
      const key = callback(item, i++);
      if (key in result) {
        result[key].push(item);
      } else {
        result[key] = [item];
      }
    }
    return result;
  };
}

// Polyfills for modern TypedArray methods required by pdfjs-dist v6
if (typeof Uint8Array !== "undefined") {
  const proto = Uint8Array.prototype as unknown as { toHex?: () => string; toBase64?: () => string };
  if (typeof proto.toHex !== "function") {
    proto.toHex = function (this: Uint8Array) {
      let res = "";
      for (let i = 0; i < this.length; i++) {
        res += this[i].toString(16).padStart(2, "0");
      }
      return res;
    };
  }

  if (typeof proto.toBase64 !== "function") {
    proto.toBase64 = function (this: Uint8Array) {
      let binary = "";
      const len = this.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(this[i]);
      }
      return typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
    };
  }
}

