import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ContractsService } from './contracts.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';

@Injectable()
export class ContractExpiryStatusScheduler {
  private readonly logger = new Logger(ContractExpiryStatusScheduler.name);

  constructor(
    private readonly contractsService: ContractsService,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  // Chạy 8:10 sáng — sau job thông báo hết hạn (8:00), trước job tạo renewal proposal (8:30)
  @Cron('10 8 * * *', { name: 'contract-expiry-status-transition', timeZone: 'Asia/Ho_Chi_Minh' })
  async run() {
    return this.schedulerLock.runExclusive('contract-expiry-status-transition', 10_800_000, async () => {
      const result = await this.contractsService.autoTransitionExpiryStatuses();
      if (result.toExpiring || result.toExpired) {
        this.logger.log(`Auto-transitioned ${result.toExpiring} contract(s) to EXPIRING, ${result.toExpired} to EXPIRED`);
      }
    });
  }
}
