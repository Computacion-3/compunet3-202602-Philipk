import * as crypto from 'crypto';

import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap, finalize } from 'rxjs';

import { AppLogger } from '../logger/logger.service';

interface RequestWithCorrelationId extends Request {
    correlationId: string;
}

@Injectable()
export class TraceabilityInterceptor implements NestInterceptor {
    constructor(private readonly logger: AppLogger) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const httpContext = context.switchToHttp();
        const request = httpContext.getRequest<RequestWithCorrelationId>();
        const response = httpContext.getResponse<Response>();

        const correlationId = this.resolveCorrelationId(request);
        const startTime = Date.now();
        let statusCode: number | undefined;

        request.correlationId = correlationId;
        response.setHeader('x-correlation-id', correlationId);

        return new Observable<unknown>((subscriber) => {
            return this.logger.runWithCorrelationId(correlationId, () => {
                const subscription = next
                    .handle()
                    .pipe(
                        tap({
                            next: () => {
                                statusCode = response.statusCode;
                            },
                            error: (error: unknown) => {
                                statusCode = this.resolveStatusCode(error);
                            },
                        }),
                        finalize(() => {
                            const duration = Date.now() - startTime;
                            const finalStatusCode = statusCode ?? response.statusCode;

                            this.logger.traceRequest(
                                request.method,
                                request.originalUrl || request.url,
                                finalStatusCode,
                                duration,
                                correlationId,
                            );
                        }),
                    )
                    .subscribe(subscriber);

                return () => subscription.unsubscribe();
            });
        });
    }

    private resolveCorrelationId(request: Request): string {
        const correlationIdHeader = request.headers['x-correlation-id'];
        const correlationId = Array.isArray(correlationIdHeader) ? correlationIdHeader[0] : correlationIdHeader;

        if (typeof correlationId === 'string' && correlationId.trim().length > 0) {
            return correlationId;
        }

        return crypto.randomUUID();
    }

    private resolveStatusCode(error: unknown): number {
        if (error instanceof HttpException) {
            return error.getStatus();
        }

        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
}
