import { Injectable } from '@nestjs/common';

type StatusBucket = '2xx' | '3xx' | '4xx' | '5xx';

@Injectable()
export class HttpMetricsService {
  private readonly counters = new Map<StatusBucket, number>([
    ['2xx', 0],
    ['3xx', 0],
    ['4xx', 0],
    ['5xx', 0],
  ]);

  record(statusCode: number): void {
    const bucket = this.toBucket(statusCode);
    this.counters.set(bucket, (this.counters.get(bucket) ?? 0) + 1);
  }

  snapshot(): Record<StatusBucket, number> {
    return {
      '2xx': this.counters.get('2xx') ?? 0,
      '3xx': this.counters.get('3xx') ?? 0,
      '4xx': this.counters.get('4xx') ?? 0,
      '5xx': this.counters.get('5xx') ?? 0,
    };
  }

  private toBucket(statusCode: number): StatusBucket {
    if (statusCode >= 500) {
      return '5xx';
    }
    if (statusCode >= 400) {
      return '4xx';
    }
    if (statusCode >= 300) {
      return '3xx';
    }
    return '2xx';
  }
}
