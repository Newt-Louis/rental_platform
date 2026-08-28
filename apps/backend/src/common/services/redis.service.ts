import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  get isEnabled(): boolean {
    return this.client !== null;
  }

  get isConfigured(): boolean {
    return !!process.env.REDIS_URL;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL not set — cache and token blacklist disabled');
      return;
    }

    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        retryStrategy: () => null,
        keyPrefix: 'leasing:',
      });
      await this.client.ping();
      this.logger.log('Redis connected');
    } catch (err) {
      this.logger.warn(`Redis unavailable — running without cache: ${(err as Error).message}`);
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // ignore cache write failures
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.exists(key)) === 1;
    } catch {
      return false;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      // ignore
    }
  }

  async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.set(key, token, 'PX', ttlMs, 'NX')) === 'OK';
    } catch {
      return false;
    }
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const released = await this.client.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        key,
        token,
      );
      return released === 1;
    } catch {
      return false;
    }
  }

  tokenBlacklistKey(token: string): string {
    return `jwt:blacklist:${token.slice(-48)}`;
  }
}
