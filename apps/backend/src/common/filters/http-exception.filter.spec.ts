import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();
  let payload: any;

  const host: any = {
    switchToHttp: () => ({
      getResponse: () => ({
        status: () => ({ json: (body: any) => { payload = body; } }),
      }),
      getRequest: () => ({ url: '/api/users', method: 'POST', requestId: 'req-1' }),
    }),
  };

  beforeEach(() => {
    payload = undefined;
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('never leaks the raw Prisma foreign-key error to the client', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Invalid `this.prisma.user.create()` invocation in /app/src/modules/users/users.service.ts:135:44',
      { code: 'P2003', clientVersion: '5.0.0', meta: { field_name: 'User_tenantId_fkey (index)' } },
    );

    filter.catch(prismaError, host);

    expect(payload.statusCode).toBe(400);
    expect(payload.code).toBe('INVALID_REFERENCE');
    expect(payload.message).toBe('The selected tenantId does not exist');
    expect(payload.message).not.toMatch(/prisma|invocation/i);
  });

  it('maps a unique-constraint violation to a conflict naming the field', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('...', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['email'] },
    });

    filter.catch(prismaError, host);

    expect(payload.statusCode).toBe(409);
    expect(payload.code).toBe('DUPLICATE_VALUE');
    expect(payload.message).toContain('email');
  });

  it('hides the details of an unexpected runtime error behind the request id', () => {
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    expect(payload.statusCode).toBe(500);
    expect(payload.code).toBe('INTERNAL_ERROR');
    expect(payload.message).toBe('Internal server error');
    expect(payload.requestId).toBe('req-1');
  });

  it('surfaces every field-level validation message, not just "Validation failed"', () => {
    filter.catch(
      new BadRequestException({ message: ['email must be an email', 'password is too short'] }),
      host,
    );

    expect(payload.code).toBe('VALIDATION_FAILED');
    expect(payload.message).toBe('email must be an email; password is too short');
    expect(payload.errors).toEqual(['email must be an email', 'password is too short']);
  });

  it('passes a domain error code through for the UI to localize', () => {
    filter.catch(
      new ConflictException({ message: 'Email already registered', code: 'USER_EMAIL_TAKEN' }),
      host,
    );

    expect(payload.statusCode).toBe(409);
    expect(payload.code).toBe('USER_EMAIL_TAKEN');
    expect(payload.message).toBe('Email already registered');
  });
});
