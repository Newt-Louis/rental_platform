import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MallAccessGuard } from './common/guards/mall-access.guard';
import { CommonModule } from './common/common.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SpacesModule } from './modules/spaces/spaces.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { CrmModule } from './modules/crm/crm.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { FitoutModule } from './modules/fitout/fitout.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { SalesModule } from './modules/sales/sales.module';
import { BillingModule } from './modules/billing/billing.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SapModule } from './modules/sap/sap.module';
import { AiModule } from './modules/ai/ai.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { BookingModule } from './modules/booking/booking.module';
import { SlotsModule } from './modules/slots/slots.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      // @nestjs/throttler v6 expects `throttlers: [{ limit, ttl, ... }]`
      throttlers: [{ limit: 100, ttl: 60 }],
      ignoreUserAgents: [/googlebot/i, /bingbot/i],
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    SpacesModule,
    TenantsModule,
    CrmModule,
    ProposalsModule,
    ApprovalsModule,
    ContractsModule,
    FitoutModule,
    TicketsModule,
    SalesModule,
    BillingModule,
    ReportsModule,
    SapModule,
    AiModule,
    DashboardModule,
    NotificationsModule,
    StorageModule,
    AnalyticsModule,
    AnnouncementsModule,
    BookingModule,
    SlotsModule,
    CategoriesModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MallAccessGuard,
    },
  ],
})
export class AppModule {}
