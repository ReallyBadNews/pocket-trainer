import type { CardBrief } from './model';
import { DAY, parseCardPricing, parseExchangeRate, parsePriceCache, priceKey, type ExchangeRate, type PriceSnapshot } from './pricing';

type Job = { card: CardBrief; priority: number; force: boolean; consumers: (() => boolean)[] };
type Dependencies = {
  card: (card: CardBrief, force: boolean) => Promise<unknown>;
  exchange: () => Promise<unknown>; read: () => Promise<string | null>; write: (raw: string) => Promise<void>; now?: () => number;
};
export class PriceClient {
  snapshots: Record<string, PriceSnapshot> = {};
  fx?: ExchangeRate;
  errors = new Set<string>();
  pending = new Set<string>();
  ready = false;
  revision = 0;
  private listeners = new Set<() => void>();
  private jobs = new Map<string, Job>();
  private active = 0;
  private attempts = new Map<string, number>();
  private fxTask?: Promise<void>;
  private fxAttempt = -Infinity;
  private loading?: Promise<void>;
  private saving = Promise.resolve();
  private dirty = false;
  private saveTimer?: ReturnType<typeof setTimeout>;
  constructor(private deps: Dependencies) {}
  private now = () => this.deps.now?.() ?? Date.now();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  version = () => this.revision;
  private emit() { this.revision++; this.listeners.forEach(fn => fn()); }
  hydrate() {
    if (!this.loading) this.loading = (async () => {
      try { const cache = parsePriceCache(await this.deps.read(), this.now()); this.snapshots = cache.snapshots; this.fx = cache.fx; } catch { /* Optional cache never blocks the binder. */ }
      this.ready = true; this.emit();
    })();
    return this.loading;
  }
  async ensure(cards: CardBrief[], isCurrent = () => true, priority = 10, force = false) {
    await this.hydrate();
    if (!isCurrent()) return;
    for (const card of cards) {
      const key = priceKey(card), cached = this.snapshots[key];
      if (cached && !force && this.now() - cached.checkedAt < DAY) { if (cached.prices.some(p => p.currency === 'EUR')) void this.ensureFx(); continue; }
      if (!force && this.now() - (this.attempts.get(key) ?? -Infinity) < 5 * 60_000) continue;
      const job = this.jobs.get(key);
      if (job) { job.consumers.push(isCurrent); job.priority = Math.min(job.priority, priority); continue; }
      if (this.pending.has(key)) continue;
      this.jobs.set(key, { card, priority, force, consumers: [isCurrent] }); this.pending.add(key);
    }
    this.emit(); this.drain();
  }
  private drain() {
    for (const [key, job] of this.jobs) if (!job.consumers.some(fn => fn())) { this.jobs.delete(key); this.pending.delete(key); }
    while (this.active < 3 && this.jobs.size) {
      const [key, job] = [...this.jobs].sort((a, b) => a[1].priority - b[1].priority)[0];
      this.jobs.delete(key); this.active++;
      this.attempts.set(key, this.now());
      void this.deps.card(job.card, job.force).then(data => {
        const snapshot = parseCardPricing(job.card, data, this.now());
        this.snapshots = { ...this.snapshots, [key]: snapshot }; this.errors.delete(key);
        if (snapshot.prices.some(p => p.currency === 'EUR')) void this.ensureFx();
        this.persist();
      }).catch(() => this.errors.add(key)).finally(() => {
        this.pending.delete(key); this.active--; this.emit(); this.drain();
      });
    }
  }
  async ensureFx(force = false) {
    if (this.fxTask) return this.fxTask;
    if (!force && this.fx && this.now() - this.fx.checkedAt < DAY) return;
    if (!force && this.now() - this.fxAttempt < 5 * 60_000) return;
    this.fxAttempt = this.now(); this.pending.add('fx'); this.emit();
    this.fxTask = this.deps.exchange().then(data => {
      this.fx = parseExchangeRate(data, this.now()); this.errors.delete('fx'); this.persist();
    }).catch(() => { this.errors.add('fx'); }).finally(() => { this.fxTask = undefined; this.pending.delete('fx'); this.emit(); });
    return this.fxTask;
  }
  private persist() {
    this.dirty = true;
    if (!this.saveTimer) this.saveTimer = setTimeout(() => { this.saveTimer = undefined; void this.flush(); }, 350);
  }
  flush() {
    if (!this.dirty) return this.saving;
    this.dirty = false;
    const raw = JSON.stringify({ version: 1, snapshots: Object.values(this.snapshots).sort((a,b) => b.checkedAt - a.checkedAt).slice(0, 5000), fx: this.fx });
    this.saving = this.saving.then(() => this.deps.write(raw)).catch(() => {});
    return this.saving;
  }
}
