import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** 统一错误响应：{ statusCode, message, error?, path?, timestamp } */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message = typeof b.message === 'string' ? b.message : Array.isArray(b.message) ? b.message.join('; ') : message;
        error = typeof b.error === 'string' ? b.error : undefined;
      }
    } else if (exception instanceof Error) {
      // Prisma 已知错误折叠为 400/404
      const name = exception.constructor.name;
      if (name === 'NotFoundError' || name === 'PrismaClientKnownRequestError') {
        status = HttpStatus.NOT_FOUND;
        message = '资源不存在';
      } else {
        message = exception.message;
      }
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} -> ${status}`, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${status}: ${message}`);
    }

    res.status(status).json({
      statusCode: status,
      message,
      error,
      path: req.url,
      timestamp: new Date().toISOString()
    });
  }
}
