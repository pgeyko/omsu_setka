import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 26 exposes an experimental `localStorage` global that shadows jsdom's
// implementation and is `undefined` without --localstorage-file. Install a
// small in-memory Storage so zustand persist and the app code work in tests.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  });
}

type MediaListener = (event: MediaQueryListEvent) => void;

function matchesMedia(query: string): boolean {
  return /min-width:\s*980px/.test(query) ? window.innerWidth >= 980 : false;
}

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const listeners = new Set<MediaListener>();
      return {
        media: query,
        get matches() {
          return matchesMedia(query);
        },
        onchange: null,
        addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
        removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
        addListener: (listener: MediaListener) => listeners.add(listener),
        removeListener: (listener: MediaListener) => listeners.delete(listener),
        dispatchEvent: () => false,
      };
    },
  });
}

if (typeof window.matchMedia !== 'function') {
  installMatchMedia();
}

if (!('Notification' in window)) {
  Object.defineProperty(window, 'Notification', {
    writable: true,
    configurable: true,
    value: class {
      static permission = 'default';
      static requestPermission = vi.fn().mockResolvedValue('granted');
    },
  });
}

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() });

afterEach(() => {
  cleanup();
  localStorage.clear();
});
