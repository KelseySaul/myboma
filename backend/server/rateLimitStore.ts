import type {ClientRateLimitInfo, Options, Store} from 'express-rate-limit';

/**
 * Shared rate-limit store backed by Upstash Redis (REST API, no extra dependency).
 *
 * express-rate-limit's default MemoryStore lives inside one serverless instance, so on
 * Vercel every cold start or parallel instance gets a fresh budget — effectively no
 * brute-force protection. When UPSTASH_REDIS_REST_URL/TOKEN are set, all instances share
 * counters. Redis errors fail OPEN (the request is allowed and the error logged) so an
 * outage of the limiter never takes the API down.
 */
export class UpstashRateLimitStore implements Store {
  private windowMs = 60_000;
  prefix: string;
  localKeys = false;

  constructor(
    private readonly url: string,
    private readonly token: string,
    prefix: string,
  ) {
    this.prefix = `rl:${prefix}:`;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private async pipeline(commands: Array<Array<string | number>>) {
    const response = await fetch(`${this.url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(commands),
    });
    if (!response.ok) throw new Error(`Upstash responded ${response.status}`);
    return (await response.json()) as Array<{result?: unknown; error?: string}>;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redisKey = this.prefix + key;
    try {
      const [incr, , ttl] = await this.pipeline([
        ['INCR', redisKey],
        ['PEXPIRE', redisKey, this.windowMs, 'NX'],
        ['PTTL', redisKey],
      ]);
      const totalHits = Number(incr?.result ?? 1);
      const msLeft = Math.max(Number(ttl?.result ?? this.windowMs), 0);
      return {totalHits, resetTime: new Date(Date.now() + msLeft)};
    } catch (error) {
      console.error('[RateLimit] Upstash increment failed; allowing request:', error);
      return {totalHits: 0, resetTime: new Date(Date.now() + this.windowMs)};
    }
  }

  async decrement(key: string) {
    await this.pipeline([['DECR', this.prefix + key]]).catch(() => undefined);
  }

  async resetKey(key: string) {
    await this.pipeline([['DEL', this.prefix + key]]).catch(() => undefined);
  }
}

/** Returns a shared store when Upstash is configured, otherwise undefined (memory store). */
export const sharedRateLimitStore = (prefix: string): Store | undefined => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new UpstashRateLimitStore(url, token, prefix) : undefined;
};
