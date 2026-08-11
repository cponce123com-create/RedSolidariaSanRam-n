// Setup global de Vitest: jest-dom, idioma determinista, stubs de jsdom.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "@/lib/i18n";

// jsdom detecta navigator.language = "en-US"; forzamos español para que las
// aserciones sobre textos de UI sean deterministas (los tests se escriben en es).
beforeAll(async () => {
  await i18n.changeLanguage("es");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

// ─── Stubs necesarios en jsdom ──────────────────────────────────────────────

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

// radix-ui (Dialog/Toast) usa ResizeObserver, no implementado en jsdom.
// Se define directo en globalThis: vi.stubGlobal lo retiraría el afterEach
// (vi.unstubAllGlobals) y los tests posteriores volverían a fallar.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// canvas-confetti usa canvas 2D (no implementado en jsdom): no-op.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
