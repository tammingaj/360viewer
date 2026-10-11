export type Listener<T> = (payload: T) => void;

/** Minimal, strongly typed event emitter. */
export class EventEmitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, listener?: Listener<Events[K]>): void {
    if (!listener) {
      this.listeners.delete(event);
      return;
    }
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (err) {
        // A broken listener must never break the viewer.
        console.error(`[360viewer] error in "${String(event)}" listener`, err);
      }
    }
  }

  protected removeAllListeners(): void {
    this.listeners.clear();
  }
}
