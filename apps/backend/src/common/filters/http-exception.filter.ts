import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Mapped shape of a database-level failure. `code` is a stable, machine-readable
 * token the frontend localizes (see `apps/frontend/src/lib/api-error.ts`);
 * `message` is only the English fallback for API clients without translations.
 */
interface MappedError {
  status: number;
  code: string;
  message: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string | null = 'INTERNAL_ERROR';
    let errors: any = null;
    let detail: string | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = null;
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        message = resp.message || message;
        // Domain services may throw `new BadRequestException({ message, code })`
        // so the UI can localize the reason instead of echoing English text.
        code = typeof resp.code === 'string' ? resp.code : null;
        if (Array.isArray(resp.message)) {
          errors = resp.message;
          // Keep the top-level message useful on its own: clients that only read
          // `message` used to get the opaque "Validation failed".
          message = resp.message.join('; ');
          code = code ?? 'VALIDATION_FAILED';
        }
      }
    } else {
      // Prisma (and any other unhandled) errors must never reach the client
      // verbatim -- their messages embed the failing query, source file and line
      // numbers, which are meaningless to an end user and leak internals.
      const mapped = this.mapDatabaseError(exception);
      if (mapped) {
        status = mapped.status;
        code = mapped.code;
        message = mapped.message;
      }

      if (exception instanceof Error) {
        detail = exception.message;
        this.logger.error(
          `${mapped ? 'Database' : 'Unhandled'} error [${requestId ?? 'unknown'}] ${request.method} ${request.url}: ${exception.message}`,
          exception.stack,
        );
      } else {
        this.logger.error(`Unhandled non-Error exception [${requestId ?? 'unknown'}]: ${String(exception)}`);
      }
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      code,
      errors,
      // Raw driver text stays available for local debugging only.
      ...(detail && process.env.NODE_ENV !== 'production' ? { detail } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }

  private mapDatabaseError(exception: unknown): MappedError | null {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const meta: any = exception.meta ?? {};

      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            code: 'DUPLICATE_VALUE',
            message: `A record with the same ${this.describeFields(meta.target) || 'value'} already exists`,
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            code: 'INVALID_REFERENCE',
            message: `The selected ${this.describeForeignKey(meta.field_name) || 'linked record'} does not exist`,
          };
        case 'P2011':
          return {
            status: HttpStatus.BAD_REQUEST,
            code: 'MISSING_REQUIRED_FIELD',
            message: `Required information is missing: ${this.describeFields(meta.target) || 'a mandatory field'}`,
          };
        case 'P2014':
          return {
            status: HttpStatus.BAD_REQUEST,
            code: 'RELATION_CONSTRAINT',
            message: 'This change would break a link to related records',
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            code: 'RECORD_NOT_FOUND',
            message: 'The requested record no longer exists',
          };
        default:
          return {
            status: HttpStatus.BAD_REQUEST,
            code: 'DATABASE_ERROR',
            message: 'The data could not be saved because it failed a database rule',
          };
      }
    }

    if (
      exception instanceof Prisma.PrismaClientValidationError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'DATABASE_ERROR',
        message: 'The submitted data is not valid for this operation',
      };
    }

    return null;
  }

  private describeFields(target: unknown): string {
    const fields = Array.isArray(target) ? target : target ? [String(target)] : [];
    return fields.map((field) => String(field)).join(', ');
  }

  /** `User_tenantId_fkey (index)` -> `tenantId`. */
  private describeForeignKey(fieldName: unknown): string {
    if (!fieldName) return '';
    const match = /_([A-Za-z0-9]+)_fkey/.exec(String(fieldName));
    return match ? match[1] : String(fieldName).replace(/\s*\(index\)$/, '');
  }
}
