// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTypingTarget } from '../../src/components/report/keys';

const el = (html: string) => {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box.firstElementChild as HTMLElement;
};

describe('isTypingTarget', () => {
  it('keeps arrow keys for fields where you type', () => {
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(el('<input type="number" />'))).toBe(true);
    expect(isTypingTarget(el('<input />'))).toBe(true);
    expect(isTypingTarget(el('<select></select>'))).toBe(true);
  });

  it('lets selectors, sliders and buttons give way to the shot and replay keys', () => {
    expect(isTypingTarget(el('<input type="radio" />'))).toBe(false);
    expect(isTypingTarget(el('<input type="range" />'))).toBe(false);
    expect(isTypingTarget(el('<input type="checkbox" />'))).toBe(false);
    expect(isTypingTarget(el('<button>Play</button>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
