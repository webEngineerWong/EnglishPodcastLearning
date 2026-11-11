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

  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
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
