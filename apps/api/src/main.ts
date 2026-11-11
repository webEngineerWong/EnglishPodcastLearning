import 'reflect-metadata';
import { fixFilename } from './common/filename';

/** 一次性存量修复：历史版本曾把 UTF-8 文件名按 Latin-1 解码入库 */
async function fixLegacyMojibakeNames(): Promise<void> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const marker = /[ÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/;
    const files = await prisma.importFile.findMany({ where: { originalName: { contains: 'ï' } } });
    for (const f of files) {
      const fixed = fixFilename(f.originalName);
      if (fixed !== f.originalName) {
        await prisma.importFile.update({ where: { id: f.id }, data: { originalName: fixed } });
      }
    }
    const jobs = await prisma.importJob.findMany({ where: { name: { contains: 'ï' } } });
    for (const j of jobs) {
      const fixed = fixFilename(j.name ?? '');
      if (fixed !== j.name) {
        await prisma.importJob.update({ where: { id: j.id }, data: { name: fixed } });
      }
    }
    await prisma.$disconnect();
    if (files.length || jobs.length) {
      Logger.log(`legacy mojibake names fixed: ${files.length} files, ${jobs.length} jobs`, 'Bootstrap');
    }
  } catch (e) {
    Logger.warn(`legacy name fix skipped: ${e instanceof Error ? e.message : e}`, 'Bootstrap');
  }
}
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';

async function bootstrap() {
  await fixLegacyMojibakeNames();
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api', { exclude: ['storage/(.*)'] });
  const port = Number(process.env.PORT ?? 3001);

  // CORS：Web(:3000)、Electron 渲染端 dev(:5173)、打包版 file://（Origin 为 "null"）均放行
  app.enableCors({
    origin: (origin, cb) => {
      const allow = (process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://localhost:5173').split(',');
      if (!origin || origin === 'null' || allow.includes('*') || allow.includes(origin.trim())) return cb(null, true);
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
