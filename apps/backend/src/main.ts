import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PrismaService } from './prisma/prisma.service';
import * as winston from 'winston';
import helmet from 'helmet';
import { json, urlencoded, static as expressStatic } from 'express';
import * as path from 'path';

async function bootstrap() {
  const logger = WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, context }) =>
            `${timestamp} [${context ?? 'App'}] ${level}: ${message}`,
          ),
        ),
      }),
      new winston.transports.File({
        filename: '/app/logs/error.log',
        level: 'error',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }),
      new winston.transports.File({
        filename: '/app/logs/combined.log',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }),
    ],
  });

  const app = await NestFactory.create(AppModule, { logger, bodyParser: false });

  // Tăng giới hạn body size lên 20MB để hỗ trợ base64 logo/layout image trong editor
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));

  // Serve uploaded files (unit media, floor plans) as static assets
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR?.replace('/unit-media', '') ?? 'uploads');
  app.use('/uploads', expressStatic(uploadRoot, { maxAge: '1d' }));

  app.setGlobalPrefix('api');

  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // Response transform interceptor — wrap responses with { success, data }
  app.useGlobalInterceptors(new TransformInterceptor());

  // Audit log interceptor — log tất cả write operations
  const prisma = app.get(PrismaService);
  app.useGlobalInterceptors(new AuditLogInterceptor(prisma));

  // Swagger — chỉ bật ở non-production hoặc khi SWAGGER_ENABLED=true
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('THISO Leasing Platform API')
      .setDescription('Backend API for THISO Mall Leasing Platform')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' }, 'JWT-auth')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { persistAuthorization: true } });
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const log = new Logger('Bootstrap');
  log.log(`THISO Leasing Platform running on port ${port}`);
  log.log(`Environment: ${process.env.NODE_ENV}`);
  log.log(`AI Chat: ${process.env.ANTHROPIC_API_KEY ? 'ENABLED' : 'DISABLED (no API key)'}`);
  log.log(`Email: ${process.env.SMTP_USER ? 'ENABLED' : 'DISABLED (no SMTP config)'}`);
  log.log(`SAP: ${process.env.SAP_ENABLED === 'true' ? `ENABLED (${process.env.SAP_BASE_URL})` : 'DISABLED'}`);
}

bootstrap();
