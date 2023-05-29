import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { HsService } from './services/hs.service';
import { SfService } from './services/sf.service';
import { SchedulerRegistry, Interval } from '@nestjs/schedule';
import { PersistanceService } from './services/persistance.service';
import { WINSTON_MODULE_PROVIDER, WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { Logger } from 'winston';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot(),
    HttpModule,
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.simple(),
            winston.format.timestamp(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/app.log',
          format: winston.format.combine(
            winston.format.simple(),
            winston.format.timestamp(),
          ),
        }),
      ],
    }),
  ],
  providers: [HsService, SfService, PersistanceService],
})
export class AppModule implements OnModuleInit {
  private pollMilliseconds: number;
  constructor(
    private readonly sf: SfService,
    private readonly hs: HsService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.pollMilliseconds = this.configService.get<number>('POLL_INTERVAL');
  }

  clearScheduler() {
    const interval = this.schedulerRegistry.getInterval('sf_hs_uni_sync');
    if (interval) {
      clearInterval(interval);
    }
  }

  async onModuleInit() {
    await this.sf.oauth();
    const interval = setInterval(
      this.intervalJob.bind(this),
      this.pollMilliseconds,
    );
    this.schedulerRegistry.addInterval('sf_hs_uni_sync', interval);
  }

  private async intervalJob() {
    const data = await this.sf.fetchAllContactsAssociatedAccount();
    this.logger.info(`AppModule : intervalJob : data.length: ${data.length}`);
    await this.hs.upsert(data);
  }
}
