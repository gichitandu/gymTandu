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
  // A margin is a target when uncovering a field, not a reason to move a field
  // that is already readable. In particular Next/Previous must not scroll up
  // just because the next input is near the top of the visible area.
  if (fieldTop < visibleTop) return fieldTop - top;
  if (fieldBottom > visibleBottom) return Math.max(0, Math.min(fieldBottom - bottom, fieldTop - top));
  return 0;
}

function editable(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!element) return false;
  const field = element as HTMLInputElement;
  return (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || (element as HTMLElement).isContentEditable === true)
    && !field.disabled && !field.readOnly && !['checkbox', 'radio', 'file', 'color', 'range', 'button', 'submit', 'reset', 'hidden', 'date', 'time', 'datetime-local', 'month', 'week'].includes(field.type);
}

/** Keeps all forms, including the login screen, inside the area above the keyboard. */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private baseline = 0;
  private width = 0;
  private editing = false;
  private scrollSpace = 0;
  private revealTimer?: ReturnType<typeof setTimeout>;
  private focusOutTimer?: ReturnType<typeof setTimeout>;
  private viewport = window.visualViewport;
  private geometry!: ViewportGeometry;
  private appliedStyles=new Map<string,string>();
  private setStyle(key:string,value:string){if(this.appliedStyles.get(key)===value)return;document.documentElement.style.setProperty(key,value);this.appliedStyles.set(key,value);}
  private readonly resize = () => { this.update(); this.scheduleReveal(); };
  private readonly scroll = () => this.update();
  private readonly focusIn = () => {
    clearTimeout(this.focusOutTimer);
    this.focusOutTimer = undefined;
    this.editing = editable(document.activeElement);
    this.update();
    this.scheduleReveal();
  };
  private readonly focusOut = () => {
    clearTimeout(this.revealTimer);
    clearTimeout(this.focusOutTimer);
    // iOS can briefly focus body between two controls. Collapsing the keyboard
    // spacer in that gap clamps scrollTop before the next input receives focus.
    this.focusOutTimer = setTimeout(() => { this.focusOutTimer = undefined; this.update(); }, 200);
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
    if (!focused && !this.editing) this.baseline = Math.max(this.baseline, layoutHeight);
    if (!this.baseline) this.baseline = layoutHeight;
    const height = this.viewport?.height ?? window.innerHeight, scale = this.viewport?.scale ?? 1;
    const keyboardVisible = viewportGeometry(layoutHeight, height, this.viewport?.offsetTop ?? 0, this.baseline, true, scale).keyboardOpen;
    if (focused) this.editing = true;
    else if (!this.focusOutTimer && !keyboardVisible) this.editing = false;
    this.geometry = viewportGeometry(layoutHeight, height, this.viewport?.offsetTop ?? 0, this.baseline, this.editing, scale);
    // Safari changes offsetTop as it pans between inputs. Keep the document's
    // extra scroll range stable for the whole keyboard session instead of
    // shrinking it on every pan, which otherwise moves the form upwards.
    this.scrollSpace = this.editing ? Math.max(this.scrollSpace, this.geometry.keyboardOpen ? layoutHeight - this.geometry.height : 0, this.geometry.keyboardInset) : 0;
    this.setStyle('--visible-height', `${this.geometry.height}px`);
    this.setStyle('--visible-top', `${this.geometry.top}px`);
    this.setStyle('--keyboard-inset', `${this.geometry.keyboardInset}px`);
    this.setStyle('--keyboard-scroll-space', `${this.scrollSpace}px`);
    this.setStyle('--form-scroll-top', this.editing ? '20px' : 'calc(76px + var(--safe-top))');
    this.setStyle('--form-scroll-bottom', this.editing ? '20px' : 'calc(100px + var(--safe-bottom))');
    document.body.classList.toggle('keyboard-open', this.geometry.keyboardOpen);
    document.body.classList.toggle('form-input-focused', this.editing);
  }

  private scheduleReveal() {
    clearTimeout(this.revealTimer);
    const field = document.activeElement;
    this.revealTimer = setTimeout(() => { if (document.activeElement === field) this.revealFocused(); }, 60);
  }

  private revealFocused() {
    const field = document.activeElement;
    if (!editable(field) || !field.getBoundingClientRect || Math.abs((this.viewport?.scale ?? 1) - 1) >= .05) return;
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
    clearTimeout(this.revealTimer);clearTimeout(this.focusOutTimer);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.viewport?.removeEventListener('resize', this.resize);
    this.viewport?.removeEventListener('scroll', this.scroll);
    document.removeEventListener('focusin', this.focusIn);
    document.removeEventListener('focusout', this.focusOut);
  }
}
