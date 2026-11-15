// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { PullToRefresh } from '../../src/components/PullToRefresh';

afterEach(cleanup);

function touch(target: Element, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number) {
  const t = { identifier: 1, target, clientX: x, clientY: y } as unknown as Touch;
  const ev = new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] });
  act(() => {
    target.dispatchEvent(ev);
  });
  return ev;
}

function pull(target: Element, dy: number, dx = 0) {
  touch(target, 'touchstart', 100, 100);
  for (let i = 1; i <= 5; i++) touch(target, 'touchmove', 100 + (dx * i) / 5, 100 + (dy * i) / 5);
  touch(target, 'touchend', 100 + dx, 100 + dy);
}

function setup(child?: React.ReactNode) {
  const onRefresh = vi.fn(async () => undefined);
  render(
    <>
      <PullToRefresh enabled onRefresh={onRefresh} />
      <main data-testid="page">{child ?? <p>Strana</p>}</main>
    </>,
  );
  return onRefresh;
}

describe('PullToRefresh', () => {
  it('pulling down from the top past the threshold refreshes', async () => {
    const onRefresh = setup();
    pull(screen.getByTestId('page'), 200);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('a short pull does nothing', () => {
    const onRefresh = setup();
    pull(screen.getByTestId('page'), 40);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('shows the indicator while pulling and the release hint past the threshold', () => {
    setup();
    const page = screen.getByTestId('page');
    touch(page, 'touchstart', 100, 100);
    touch(page, 'touchmove', 100, 140);
    expect(screen.getByRole('status', { hidden: true }).getAttribute('data-state')).toBe('pull');
    touch(page, 'touchmove', 100, 320);
    expect(screen.getByRole('status', { hidden: true }).getAttribute('data-state')).toBe('ready');
    expect(screen.getByRole('status', { hidden: true }).textContent).toContain('Pusti za osvežavanje');
  });

  it('not when the content under the finger is scrolled down', () => {
    const onRefresh = setup(<div data-testid="list" style={{ overflowY: 'auto', height: 100 }}><p>a</p></div>);
    const list = screen.getByTestId('list');
    Object.defineProperty(list, 'scrollHeight', { value: 500 });
    Object.defineProperty(list, 'clientHeight', { value: 100 });
    list.scrollTop = 120;
    pull(list, 200);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('not for a sideways swipe', () => {
    const onRefresh = setup();
    pull(screen.getByTestId('page'), 120, 200);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('not over the target or a chart (their own gestures), nor in a text field', () => {
    const onRefresh = setup(
      <>
        <canvas data-testid="canvas" />
        <input data-testid="field" />
        <div data-no-pull><span data-testid="inside">x</span></div>
      </>,
    );
    pull(screen.getByTestId('canvas'), 200);
    pull(screen.getByTestId('field'), 200);
    pull(screen.getByTestId('inside'), 200);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does nothing when disabled (a desktop or a mouse)', () => {
    const onRefresh = vi.fn();
    render(
      <>
        <PullToRefresh enabled={false} onRefresh={onRefresh} />
        <main data-testid="page" />
      </>,
    );
    pull(screen.getByTestId('page'), 200);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
