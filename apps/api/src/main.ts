import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api', { exclude: ['storage/(.*)'] });
  const port = Number(process.env.PORT ?? 3001);

  // CORS：Web(:3000)、Electron 渲染端 dev(:5173)、打包版 file://（Origin 为 "null"）均放行
  app.enableCors({
    origin: (origin, cb) => {
      const allow = (process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://localhost:5173').split(',');
      if (!origin || origin === 'null' || allow.includes(origin.trim())) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false
    })
  );

  const config = new DocumentBuilder()
    .setTitle('English Learning Platform API')
    .setDescription('英语学习平台 REST API')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useLogger(new Logger());
  await app.listen(port);
  Logger.log(`API ready at http://localhost:${port}/api  (Swagger: /docs)`, 'Bootstrap');
}

void bootstrap();
