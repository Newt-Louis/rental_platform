import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingAddInService } from './billing-addin.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';

@Injectable()
export class BillingAddInScheduler {
  private readonly logger = new Logger(BillingAddInScheduler.name);

  constructor(
    private readonly billingAddInService: BillingAddInService,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  // Chạy 05:00 ngày 1 hàng tháng — trước job lập hoá đơn của billing-scheduler.ts (06:00) để
  // vận hành có sẵn kỳ add-in ngay đầu kỳ, kịp nhập liệu/chốt trước khi Kế toán chạy job hoá đơn.
  @Cron('0 5 1 * *', { name: 'periodic-charge-generate-pending', timeZone: 'Asia/Ho_Chi_Minh' })
  async run() {
    const result = await this.schedulerLock.runExclusive('periodic-charge-generate-pending', 3_600_000, () =>
      this.billingAddInService.generatePendingForPeriod(),
    );
    if (result.executed && result.value.created) {
      this.logger.log(`Generated ${result.value.created} pending periodic charge entries for period ${result.value.period}`);
    }
  }
}
