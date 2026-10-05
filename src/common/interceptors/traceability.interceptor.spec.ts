import { CallHandler, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { firstValueFrom, of, throwError } from 'rxjs';

import { AppLogger } from '../logger/logger.service';

import { TraceabilityInterceptor } from './traceability.interceptor';

type RequestMock = Partial<Request> & {
    correlationId?: string;
    headers: Request['headers'];
    method: string;
    originalUrl?: string;
    url: string;
};

describe('TraceabilityInterceptor', () => {
    const createLogger = (): Pick<AppLogger, 'runWithCorrelationId' | 'traceRequest'> => ({
        runWithCorrelationId: jest.fn(<T>(_correlationId: string, callback: () => T): T => callback()),
        traceRequest: jest.fn(),
    });

    const createContext = (request: RequestMock, response: Partial<Response>): ExecutionContext =>
        ({
            switchToHttp: () => ({
                getRequest: () => request,
                getResponse: () => response,
            }),
        }) as ExecutionContext;

    it('should preserve the incoming correlation id and write it in the response header', async () => {
        const logger = createLogger();
        const request: RequestMock = {
            headers: { 'x-correlation-id': 'test-cid-12345' },
            method: 'GET',
            originalUrl: '/users',
            url: '/users',
        };
        const response: Partial<Response> = {
            statusCode: HttpStatus.OK,
            setHeader: jest.fn(),
        };
        const next: CallHandler = {
            handle: jest.fn(() => of({ ok: true })),
        };

        const interceptor = new TraceabilityInterceptor(logger as AppLogger);

        await expect(firstValueFrom(interceptor.intercept(createContext(request, response), next))).resolves.toEqual({
            ok: true,
        });

        expect(request.correlationId).toBe('test-cid-12345');
        expect(response.setHeader).toHaveBeenCalledWith('x-correlation-id', 'test-cid-12345');
        expect(logger.traceRequest).toHaveBeenCalledWith(
            'GET',
            '/users',
            HttpStatus.OK,
            expect.any(Number),
            'test-cid-12345',
        );
    });

    it('should generate a correlation id when the request does not include one', async () => {
        const logger = createLogger();
        const request: RequestMock = {
            headers: {},
            method: 'GET',
            originalUrl: '/users',
            url: '/users',
        };
        const response: Partial<Response> = {
            statusCode: HttpStatus.OK,
            setHeader: jest.fn(),
        };
        const next: CallHandler = {
            handle: jest.fn(() => of({ ok: true })),
        };

        const interceptor = new TraceabilityInterceptor(logger as AppLogger);

        await firstValueFrom(interceptor.intercept(createContext(request, response), next));

        expect(request.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(response.setHeader).toHaveBeenCalledWith('x-correlation-id', request.correlationId);
    });

    it('should log the error status code without changing the thrown exception', async () => {
        const logger = createLogger();
        const request: RequestMock = {
            headers: { 'x-correlation-id': 'error-cid' },
            method: 'GET',
            originalUrl: '/users/999',
            url: '/users/999',
        };
        const response: Partial<Response> = {
            statusCode: HttpStatus.OK,
            setHeader: jest.fn(),
        };
        const error = new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
        const next: CallHandler = {
            handle: jest.fn(() => throwError(() => error)),
        };

        const interceptor = new TraceabilityInterceptor(logger as AppLogger);

        await expect(firstValueFrom(interceptor.intercept(createContext(request, response), next))).rejects.toThrow(
            error,
        );

        expect(logger.traceRequest).toHaveBeenCalledWith(
            'GET',
            '/users/999',
            HttpStatus.NOT_FOUND,
            expect.any(Number),
            'error-cid',
        );
    });
});
