import { redactSensitiveData } from './audit-log.interceptor';

describe('redactSensitiveData', () => {
  it('redacts sensitive values at every nesting level', () => {
    const result = redactSensitiveData({
      email: 'user@example.com',
      password: 'plain-text',
      profile: {
        accessToken: 'jwt-value',
        api_key: 'provider-key',
        displayName: 'User',
      },
      cards: [{ cardNumber: '4111111111111111', cvv: '123' }],
    });

    expect(result).toEqual({
      email: 'user@example.com',
      password: '[REDACTED]',
      profile: {
        accessToken: '[REDACTED]',
        api_key: '[REDACTED]',
        displayName: 'User',
      },
      cards: [{ cardNumber: '[REDACTED]', cvv: '[REDACTED]' }],
    });
  });

  it('handles circular payloads without throwing', () => {
    const payload: Record<string, unknown> = { name: 'test' };
    payload.self = payload;

    expect(redactSensitiveData(payload)).toEqual({
      name: 'test',
      self: '[CIRCULAR]',
    });
  });
});
