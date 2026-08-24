import { TelemetryController } from './telemetry.controller';

describe('TelemetryController', () => {
  let controller: TelemetryController;

  beforeEach(() => {
    controller = new TelemetryController();
  });

  it('acknowledges a well-formed report and logs it with the request id', () => {
    const logSpy = jest.spyOn((controller as any).logger, 'error').mockImplementation();

    const result = controller.report(
      { message: 'Cannot read properties of undefined', source: 'error-boundary', route: '/billing' },
      { requestId: 'req-123' },
    );

    expect(result).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged).toEqual(
      expect.objectContaining({
        requestId: 'req-123',
        source: 'error-boundary',
        message: 'Cannot read properties of undefined',
        route: '/billing',
      }),
    );
  });

  it('falls back to null requestId and unknown source when not provided', () => {
    const logSpy = jest.spyOn((controller as any).logger, 'error').mockImplementation();

    controller.report({ message: 'boom' }, {});

    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged).toEqual(
      expect.objectContaining({ requestId: null, source: 'unknown', route: null }),
    );
  });
});
