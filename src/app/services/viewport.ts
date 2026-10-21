import { Injectable } from '@angular/core';

export interface ViewportGeometry {
  top: number;
  height: number;
  bottom: number;
  keyboardInset: number;
  keyboardOpen: boolean;
}

export function viewportGeometry(layoutHeight: number, visibleHeight: number, top: number, baselineHeight: number, focused: boolean, scale = 1): ViewportGeometry {
  const height = Math.max(1, Number.isFinite(visibleHeight) ? visibleHeight : layoutHeight);
  const offset = Math.max(0, Number.isFinite(top) ? top : 0);
  const bottom = offset + height;
  // Android may resize the layout viewport too; compare against its unfocused
  // size as well. Pinch zoom alone must not be mistaken for a keyboard.
  const keyboardOpen = focused && Math.abs(scale - 1) < .05 && Math.max(layoutHeight, baselineHeight) - height > 120;
  return { top: offset, height, bottom, keyboardOpen, keyboardInset: keyboardOpen ? Math.max(0, layoutHeight - bottom) : 0 };
}

export function focusScrollDelta(fieldTop: number, fieldBottom: number, visibleTop: number, visibleBottom: number, padding = 16): number {
  const top = visibleTop + padding, bottom = visibleBottom - padding;
  if (fieldTop < top) return fieldTop - top;
  if (fieldBottom > bottom) return Math.min(fieldBottom - bottom, fieldTop - top);
  return 0;
}

function editable(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!element) return false;
  const field = element as HTMLInputElement;
  return (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || (element as HTMLElement).isContentEditable === true)
    && !field.disabled && !field.readOnly && !['checkbox', 'radio', 'file', 'color', 'range', 'button', 'submit', 'reset', 'hidden'].includes(field.type);
}

/** Keeps all forms, including the login screen, inside the area above the keyboard. */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private baseline = 0;
  private width = 0;
  private revealTimer?: ReturnType<typeof setTimeout>;
  private settleTimer?: ReturnType<typeof setTimeout>;
  private focusOutTimer?: ReturnType<typeof setTimeout>;
  private viewport = window.visualViewport;
  private geometry!: ViewportGeometry;
  private readonly resize = () => { this.update(); this.scheduleReveal(); };
  private readonly scroll = () => this.update();
  private readonly focusIn = () => {
    this.update();
    this.scheduleReveal();
    clearTimeout(this.settleTimer);
    // Some Safari versions finish moving the viewport after focusin/resize.
    this.settleTimer = setTimeout(() => { this.update(); this.revealFocused(); }, 350);
  };
  private readonly focusOut = () => {
    clearTimeout(this.focusOutTimer);
    this.focusOutTimer = setTimeout(() => this.update(), 0);
  };

  constructor() {
    this.update();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    this.viewport?.addEventListener('resize', this.resize);
    this.viewport?.addEventListener('scroll', this.scroll);
    document.addEventListener('focusin', this.focusIn);
    document.addEventListener('focusout', this.focusOut);
  }

  private update() {
    const focused = editable(document.activeElement);
    const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight || 0);
    if (this.width && Math.abs(window.innerWidth - this.width) > 80) this.baseline = layoutHeight;
    this.width = window.innerWidth;
    if (!focused) this.baseline = Math.max(this.baseline, layoutHeight);
    if (!this.baseline) this.baseline = layoutHeight;
    this.geometry = viewportGeometry(layoutHeight, this.viewport?.height ?? window.innerHeight, this.viewport?.offsetTop ?? 0, this.baseline, focused, this.viewport?.scale ?? 1);
    const style = document.documentElement.style;
    style.setProperty('--visible-height', `${this.geometry.height}px`);
    style.setProperty('--visible-top', `${this.geometry.top}px`);
    style.setProperty('--keyboard-inset', `${this.geometry.keyboardInset}px`);
    style.setProperty('--form-scroll-top', focused ? '20px' : 'calc(76px + var(--safe-top))');
    style.setProperty('--form-scroll-bottom', focused ? '20px' : 'calc(100px + var(--safe-bottom))');
    document.body.classList.toggle('keyboard-open', this.geometry.keyboardOpen);
    document.body.classList.toggle('form-input-focused', focused);
  }

  private scheduleReveal() {
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => this.revealFocused(), 60);
  }

  private revealFocused() {
    const field = document.activeElement;
    if (!editable(field) || !field.getBoundingClientRect) return;
    const modal = field.closest<HTMLElement>('.modal');
    const fieldRect = field.getBoundingClientRect();
    let top = this.geometry.top, bottom = this.geometry.bottom;
    if (modal) {
      const modalRect = modal.getBoundingClientRect();
      top = Math.max(top, modalRect.top);
      bottom = Math.min(bottom, modalRect.bottom);
    } else if (!this.geometry.keyboardOpen) {
      if (window.innerWidth > 800) {
        const header = document.querySelector<HTMLElement>('.session-header');
        if (header) top = Math.max(top, header.getBoundingClientRect().bottom);
      }
      const navigation = document.querySelector<HTMLElement>('.bottom-nav')?.getBoundingClientRect();
      if (navigation && navigation.height > 0 && navigation.top > top) bottom = Math.min(bottom, navigation.top);
    }
    const delta = focusScrollDelta(fieldRect.top, fieldRect.bottom, top, bottom, 20);
    if (delta) {
      if (modal) modal.scrollTop += delta;
      else window.scrollBy({ top: delta, behavior: 'auto' });
    }
    // History editing keeps wide numeric controls in a horizontally scrollable table.
    const table = field.closest<HTMLElement>('.table-wrap');
    if (table) {
      const bounds = table.getBoundingClientRect();
      if (fieldRect.left < bounds.left + 8) table.scrollLeft += fieldRect.left - bounds.left - 8;
      else if (fieldRect.right > bounds.right - 8) table.scrollLeft += fieldRect.right - bounds.right + 8;
    }
  }

  ngOnDestroy() {
    clearTimeout(this.revealTimer);clearTimeout(this.settleTimer);clearTimeout(this.focusOutTimer);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.viewport?.removeEventListener('resize', this.resize);
    this.viewport?.removeEventListener('scroll', this.scroll);
    document.removeEventListener('focusin', this.focusIn);
    document.removeEventListener('focusout', this.focusOut);
  }
}
