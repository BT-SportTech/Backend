import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { ScheduledPushProcessor } from './scheduled-push.processor';

@ApiExcludeController()
@Controller('internal/cron')
export class InternalCronController {
  constructor(
    private readonly processor: ScheduledPushProcessor,
    private readonly config: ConfigService,
  ) {}

  @Post('process-scheduled-pushes')
  @HttpCode(HttpStatus.OK)
  async processScheduledPushes(
    @Headers('x-cron-secret') cronSecret?: string,
  ) {
    const expected = this.config.get<string>('CRON_SECRET');
    if (!expected?.trim() || cronSecret !== expected) {
      throw new UnauthorizedException('Invalid cron secret.');
    }

    await this.processor.processDuePushes();
    return { ok: true };
  }
}
