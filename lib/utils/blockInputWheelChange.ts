import type { InputHTMLAttributes, Ref } from 'react';

export type InputPropsWithRef = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

const blockedInputs = new WeakSet<HTMLInputElement>();

function onNumberInputWheel(event: WheelEvent) {
  const input = event.currentTarget as HTMLInputElement;
  if (document.activeElement === input) {
    event.preventDefault();
  }
}

export function attachBlockInputWheelChange(input: HTMLInputElement) {
  if (blockedInputs.has(input)) return;
  input.addEventListener('wheel', onNumberInputWheel, { passive: false });
  blockedInputs.add(input);
}

export function detachBlockInputWheelChange(input: HTMLInputElement) {
  if (!blockedInputs.has(input)) return;
  input.removeEventListener('wheel', onNumberInputWheel);
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

/** Merge wheel blocking onto native input props (e.g. grid qty cells without keyboard nav). */
export function withBlockInputWheelChange(
  props: InputPropsWithRef = {}
): InputPropsWithRef {
  return {
    ...props,
    ref: createBlockInputWheelRef(props.ref),
  };
}
