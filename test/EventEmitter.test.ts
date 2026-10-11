import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../src/EventEmitter';

interface Events {
  ping: { n: number };
  done: string;
}

/** `emit` is protected, so expose it the way a subclass would use it. */
class Emitter extends EventEmitter<Events> {
  fire<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.emit(event, payload);
  }
  reset(): void {
    this.removeAllListeners();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EventEmitter', () => {
  it('calls listeners with the payload', () => {
    const emitter = new Emitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('ping', a);
    emitter.on('ping', b);
    emitter.fire('ping', { n: 1 });
    expect(a).toHaveBeenCalledWith({ n: 1 });
    expect(b).toHaveBeenCalledWith({ n: 1 });
  });

  it('only calls listeners of the emitted event', () => {
    const emitter = new Emitter();
    const ping = vi.fn();
    const done = vi.fn();
    emitter.on('ping', ping);
    emitter.on('done', done);
    emitter.fire('done', 'ok');
    expect(ping).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith('ok');
  });

  it('does nothing when there are no listeners', () => {
    expect(() => new Emitter().fire('ping', { n: 1 })).not.toThrow();
  });

  it('registers the same listener only once', () => {
    const emitter = new Emitter();
    const listener = vi.fn();
    emitter.on('ping', listener);
    emitter.on('ping', listener);
    emitter.fire('ping', { n: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('on() returns a function that unsubscribes', () => {
    const emitter = new Emitter();
    const listener = vi.fn();
    const off = emitter.on('ping', listener);
    off();
    emitter.fire('ping', { n: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('off() removes one listener, or all listeners of an event', () => {
    const emitter = new Emitter();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    emitter.on('ping', a);
    emitter.on('ping', b);
    emitter.on('done', c);

    emitter.off('ping', a);
    emitter.fire('ping', { n: 1 });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);

    emitter.off('ping');
    emitter.fire('ping', { n: 2 });
    expect(b).toHaveBeenCalledTimes(1);

    emitter.fire('done', 'ok');
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('once() fires a single time', () => {
    const emitter = new Emitter();
    const listener = vi.fn();
    emitter.once('ping', listener);
    emitter.fire('ping', { n: 1 });
    emitter.fire('ping', { n: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ n: 1 });
  });

  it('once() can be cancelled before it fires', () => {
    const emitter = new Emitter();
    const listener = vi.fn();
    const off = emitter.once('ping', listener);
    off();
    emitter.fire('ping', { n: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps going when a listener throws', () => {
    const emitter = new Emitter();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    emitter.on('ping', () => {
      throw new Error('boom');
    });
    emitter.on('ping', after);
    expect(() => emitter.fire('ping', { n: 1 })).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('lets a listener unsubscribe another one during an emit without skipping the current round', () => {
    const emitter = new Emitter();
    const second = vi.fn();
    emitter.on('ping', () => emitter.off('ping', second));
    emitter.on('ping', second);
    emitter.fire('ping', { n: 1 });
    emitter.fire('ping', { n: 2 });
    // The listener set is copied per emit, so `second` still sees the first one.
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removeAllListeners() clears everything', () => {
    const emitter = new Emitter();
    const ping = vi.fn();
    const done = vi.fn();
    emitter.on('ping', ping);
    emitter.on('done', done);
    emitter.reset();
    emitter.fire('ping', { n: 1 });
    emitter.fire('done', 'ok');
    expect(ping).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });
});
