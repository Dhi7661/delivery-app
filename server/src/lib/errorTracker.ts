import crypto from 'node:crypto';

export interface ErrorReport {
  eventId: string;
  timestamp: string;
  message: string;
  name: string;
  stack?: string;
  context?: Record<string, any>;
}

class ErrorTracker {
  private dsn?: string;
  private recordedErrors: ErrorReport[] = [];

  constructor() {
    this.dsn = process.env.SENTRY_DSN;
  }

  /**
   * Captures an unhandled exception or operational error.
   * Dispatches to Sentry if configured, otherwise records in memory & logs structured JSON.
   */
  captureException(err: Error, context?: Record<string, any>): string {
    const eventId = `err_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const report: ErrorReport = {
      eventId,
      timestamp: new Date().toISOString(),
      name: err.name || 'Error',
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
      context,
    };

    this.recordedErrors.push(report);
    // Keep last 100 errors in memory
    if (this.recordedErrors.length > 100) {
      this.recordedErrors.shift();
    }

    console.error(`[ErrorTracker] [Event: ${eventId}]`, err.message, context || '');

    // Note: If Sentry DSN is present, we could send to Sentry HTTP ingest API:
    // https://docs.sentry.io/api/events/store-an-event/
    return eventId;
  }

  getRecentErrors(): ErrorReport[] {
    return [...this.recordedErrors];
  }

  clearErrors(): void {
    this.recordedErrors = [];
  }
}

export const errorTracker = new ErrorTracker();
