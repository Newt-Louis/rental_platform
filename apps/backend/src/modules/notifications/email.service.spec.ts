import { EmailService } from './email.service';

describe('EmailService resilience', () => {
  const originalEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_MAX_ATTEMPTS: process.env.EMAIL_MAX_ATTEMPTS,
    EMAIL_RETRY_BASE_MS: process.env.EMAIL_RETRY_BASE_MS,
  };

  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.EMAIL_MAX_ATTEMPTS = '3';
    process.env.EMAIL_RETRY_BASE_MS = '0';
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('retries transient SMTP failures and returns the delivered message id', async () => {
    const service = new EmailService();
    const sendMail = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce({ messageId: 'message-1' });
    (service as any).transporter = { sendMail };

    await expect(service.sendMail({
      to: 'tenant@example.test',
      subject: 'Invoice',
      html: '<p>Invoice</p>',
    })).resolves.toEqual({ messageId: 'message-1' });

    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent SMTP errors', async () => {
    const service = new EmailService();
    const error = Object.assign(new Error('mailbox unavailable'), { responseCode: 550 });
    const sendMail = jest.fn().mockRejectedValue(error);
    (service as any).transporter = { sendMail };

    await expect(service.sendMail({
      to: 'missing@example.test',
      subject: 'Invoice',
      html: '<p>Invoice</p>',
    })).rejects.toThrow('mailbox unavailable');

    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
