import type { InputHTMLAttributes, Ref } from 'react';

export type InputPropsWithRef = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

const blockedInputs = new WeakSet<HTMLInputElement>();

function isNumberInput(element: EventTarget | null): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type === 'number';
}

function shouldBlockSpinKey(key: string) {
  return key === 'ArrowUp' || key === 'ArrowDown';
}

function onNumberInputWheel(event: WheelEvent) {
  const input = event.currentTarget as HTMLInputElement;
  if (document.activeElement === input) {
    event.preventDefault();
  }
}

function onNumberInputKeyDown(event: KeyboardEvent) {
  const input = event.currentTarget as HTMLInputElement;
  if (document.activeElement !== input) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
  }
}

export function installGlobalNumberInputSpinBlock() {
  if (typeof document === 'undefined') return () => {};

  const onWheel = (event: WheelEvent) => {
    if (isNumberInput(document.activeElement)) {
      event.preventDefault();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!shouldBlockSpinKey(event.key)) return;
    const active = document.activeElement;
    const target = event.target;
    if (isNumberInput(active) || isNumberInput(target)) {
      event.preventDefault();
    }
  };

  document.addEventListener('wheel', onWheel, { passive: false, capture: true });
  document.addEventListener('keydown', onKeyDown, { capture: true });

  return () => {
    document.removeEventListener('wheel', onWheel, { capture: true });
    document.removeEventListener('keydown', onKeyDown, { capture: true });
  };
}

/** @deprecated Prefer global NumberInputSpinGuard; kept for targeted input props. */
export function attachBlockInputWheelChange(input: HTMLInputElement) {
  if (blockedInputs.has(input)) return;
  input.addEventListener('wheel', onNumberInputWheel, { passive: false });
  input.addEventListener('keydown', onNumberInputKeyDown);
  blockedInputs.add(input);
}

export function detachBlockInputWheelChange(input: HTMLInputElement) {
  if (!blockedInputs.has(input)) return;
  input.removeEventListener('wheel', onNumberInputWheel);
  input.removeEventListener('keydown', onNumberInputKeyDown);
  blockedInputs.delete(input);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  ref.current = value;
}

/** Ref callback that blocks mouse-wheel value changes on number inputs (non-passive listener). */
export function createBlockInputWheelRef<T extends HTMLInputElement>(
  existingRef?: Ref<T>
) {
  let current: T | null = null;

  return (element: T | null) => {
    if (current && current !== element) {
      detachBlockInputWheelChange(current);
    }
    current = element;
    if (element) {
      attachBlockInputWheelChange(element);
    }
    assignRef(existingRef, element);
  };
}

/** Merge wheel / arrow-key spin blocking onto native number input props. */
export function withBlockInputWheelChange(
  props: InputPropsWithRef = {}
): InputPropsWithRef {
  const userOnKeyDown = props.onKeyDown;
  return {
    ...props,
    ref: createBlockInputWheelRef(props.ref),
    onKeyDown: (event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
      }
      userOnKeyDown?.(event);
    },
  };
}
