import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingScheduleService } from './billing-schedule.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';

@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);

  constructor(private billingScheduleService: BillingScheduleService, private schedulerLock: SchedulerLockService) {}

  @Cron('0 6 1 * *', { name: 'monthly-billing-generate', timeZone: 'Asia/Ho_Chi_Minh' })
  async generateMonthlyInvoices() {
    return this.schedulerLock.runExclusive('monthly-billing-generate', 21_600_000, async () => {
    this.logger.log('Running monthly billing schedule invoice generation...');
    const result = await this.billingScheduleService.generateDueInvoices(new Date());
    this.logger.log(`Billing scheduler created ${result.created} draft invoice(s)`);
    return result;
    });
  }
}
