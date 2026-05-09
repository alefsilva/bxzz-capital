import { ErrorHandler, Injectable } from '@angular/core';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const timestamp = new Date().toISOString();
    console.error('[BXZZ Capital] Unhandled Error', { message, stack, timestamp });
  }
}
