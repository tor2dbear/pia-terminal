/** One tappable key on the on-screen key bar (for phones without real keys). */
export interface KeySpec {
  label: string;
  run(): void;
  /** Visually de-emphasise (e.g. punctuation vs. actions). */
  subtle?: boolean;
}

/**
 * A full-screen app that temporarily takes over the terminal — an editor, a
 * game, a viewer. The terminal hides its own output and input line, hands the
 * app a container plus the keyboard, and restores itself when the app exits.
 */
export interface ScreenApp {
  /** Render into the given container. */
  mount(container: HTMLElement): void;
  /** A control key (Enter, Backspace, arrows, Ctrl+…). */
  onKey(e: KeyboardEvent): void;
  /** Printable text (desktop typing, soft keyboard, IME, paste). */
  onText(text: string): void;
  /** Tear down before the terminal is restored. */
  unmount(): void;
  /** Keys to show on the on-screen bar while this app is active (optional). */
  keys?(): KeySpec[];
}

/** Builds a {@link ScreenApp}, given the `exit` callback that ends it. */
export type ScreenAppFactory = (exit: () => void) => ScreenApp;
