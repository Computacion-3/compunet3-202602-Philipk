import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AppLogger } from './common/logger/logger.service';
import { CryptoInterceptor } from './common/interceptors/crypto.interceptor';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    const appLogger = app.get(AppLogger);
    app.useLogger(appLogger);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true, // Remueve propiedades que no estén en el DTO
            forbidNonWhitelisted: true, // Lanza error si se envían propiedades no reconocidas
            transform: true, // Transforma automáticamente los payloads a instancias de sus DTOs
        }),
    );

    app.useGlobalInterceptors(new CryptoInterceptor());

    const port = process.env.PORT ?? 3000;

    await app.listen(port);
    appLogger.log(`Servidor iniciado exitosamente en: ${port}`);
}

bootstrap().catch((error) => {
    console.error(error);
});
