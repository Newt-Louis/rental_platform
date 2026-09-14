import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T> | StreamableFile>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T> | StreamableFile> {
    const request = context.switchToHttp().getRequest();
    const url = request.url as string;

    // Skip wrapping for auth endpoints to maintain compatibility
    if (url.includes('/auth/')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // Binary file responses must reach Nest's HTTP adapter as the original
        // StreamableFile. Wrapping one in the JSON API envelope turns the file
        // object into JSON while leaving its PDF/image Content-Type in place,
        // producing a successful HTTP 200 response that browsers cannot open.
        if (data instanceof StreamableFile) {
          return data;
        }

        // If response is a paginated object (has data, total, limit), spread it with success flag
        // to avoid double wrapping: { data: [...], total, page, limit, totalPages }
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'total' in data &&
          'limit' in data
        ) {
          return { success: true, requestId: request.requestId ?? null, ...data };
        }

        // Otherwise, wrap in data property
        return { success: true, requestId: request.requestId ?? null, data };
      }),
    );
  }
}
