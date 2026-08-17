import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCatalogScrollRestore } from './catalog-scroll-restore.ts';

describe('applyCatalogScrollRestore', () => {
  it('scrolls the remembered card into view when the anchor exists', () => {
    const calls: string[] = [];
    const anchor = {
      scrollIntoView: () => {
        calls.push('into-view');
      },
      getBoundingClientRect: () => ({
        top: 200,
        bottom: 400,
      }),
    };

    const previousQuery = globalThis.document;
    const previousWindow = globalThis.window;
    globalThis.window = {
      innerHeight: 800,
      scrollTo: () => {
        calls.push('scroll-to');
      },
    } as never;
    globalThis.document = {
      querySelector: (selector: string) =>
        selector.includes('item-42') ? anchor : null,
    } as never;

    const result = applyCatalogScrollRestore({
      scrollY: 640,
      anchorItemId: 'item-42',
    });

    globalThis.document = previousQuery;
    globalThis.window = previousWindow;

    assert.equal(result, 'anchored');
    assert.deepEqual(calls, ['into-view']);
  });

  it('falls back to scrollY when the card is not mounted yet', () => {
    const calls: number[] = [];
    const previousQuery = globalThis.document;
    const previousWindow = globalThis.window;
    globalThis.window = {
      innerHeight: 800,
      scrollTo: (options: { top: number }) => {
        calls.push(options.top);
      },
    } as never;
    globalThis.document = {
      querySelector: () => null,
    } as never;

    const result = applyCatalogScrollRestore({
      scrollY: 640,
      anchorItemId: 'missing',
    });

    globalThis.document = previousQuery;
    globalThis.window = previousWindow;

    assert.equal(result, 'scrolled');
    assert.deepEqual(calls, [640]);
  });
});
