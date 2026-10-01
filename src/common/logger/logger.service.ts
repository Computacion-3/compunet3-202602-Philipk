import * as fs from 'fs';
import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { STATUS_CODES } from 'http';

import { Injectable, LoggerService, OnModuleDestroy } from '@nestjs/common';

type TraceContext = {
    correlationId: string;
};

@Injectable()
export class AppLogger implements LoggerService, OnModuleDestroy {
    private logStream: fs.WriteStream;
    private readonly traceStorage = new AsyncLocalStorage<TraceContext>();

    constructor() {
        const dateStamp = new Date().toISOString().split('T')[0];
        const logDir = path.join(process.cwd(), 'logs');

        // Garantiza la existencia del directorio de almacenamiento
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, `app-${dateStamp}.log`);
        // Abre el stream en modo append ('a')
        this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    }

    log(message: string) {
        this.write('LOG', message);
    }

    error(message: string, trace?: string) {
        this.write('ERROR', message, trace);
    }

    warn(message: string) {
        this.write('WARN', message);
    }

    debug(message: string) {
        this.write('DEBUG', message);
    }

    verbose(message: string) {
        this.write('VERBOSE', message);
    }

    logWithTrace(correlationId: string, level: string, message: string): void {
        this.write(level.toUpperCase(), message, undefined, correlationId);
    }

    runWithCorrelationId<T>(correlationId: string, callback: () => T): T {
        return this.traceStorage.run({ correlationId }, callback);
    }

    traceRequest(method: string, url: string, statusCode: number, duration: number, correlationId: string): void {
        const statusText = this.getStatusText(statusCode);
        this.writeLine(
            `[TRACE] [${method} ${url}] [${statusCode} ${statusText}] [Duration: ${duration}ms] [CorrelationID: ${correlationId}]`,
        );
    }

    private write(level: string, message: string, trace?: string, correlationId?: string) {
        const timestamp = new Date().toISOString();
        const activeCorrelationId = correlationId ?? this.traceStorage.getStore()?.correlationId;
        const traceContext = activeCorrelationId ? ` [CorrelationID: ${activeCorrelationId}]` : '';
        const formattedLog = `[${timestamp}] [${level}]${traceContext} ${message}${
            trace ? '\n[Stack Trace]: ' + trace : ''
        }`;

        this.writeLine(formattedLog);
    }

    private writeLine(formattedLog: string) {
        // Escritura persistente en disco
        this.logStream.write(`${formattedLog}\n`);

        // Salida formateada en consola
        console.info(formattedLog);
    }

    private getStatusText(statusCode: number): string {
        return STATUS_CODES[statusCode]?.toUpperCase() ?? 'UNKNOWN';
    }

    onModuleDestroy() {
        if (this.logStream) {
            this.logStream.end();
        }
    }
}
