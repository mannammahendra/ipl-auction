import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly windowMs = 60 * 1000; // 1 minute window
  private readonly maxRequests = 15; // Max 15 attempts per minute per IP
  private readonly hits = new Map<string, RateLimitRecord>();

  constructor() {
    // Periodically clean up stale records every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of this.hits.entries()) {
        record.timestamps = record.timestamps.filter((t) => now - t < this.windowMs);
        if (record.timestamps.length === 0) {
          this.hits.delete(ip);
        }
      }
    }, 5 * 60 * 1000).unref();
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown-client';

    const now = Date.now();
    let record = this.hits.get(ip);
    if (!record) {
      record = { timestamps: [] };
      this.hits.set(ip, record);
    }

    // Filter to requests within current window
    record.timestamps = record.timestamps.filter((t) => now - t < this.windowMs);

    if (record.timestamps.length >= this.maxRequests) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many authentication attempts. Please try again in 1 minute.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    return true;
  }
}

