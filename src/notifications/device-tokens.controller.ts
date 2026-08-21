import { Body, Controller, Delete, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as Prisma from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DeviceTokensService } from './device-tokens.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { RemoveDeviceTokenDto } from './dto/remove-device-token.dto';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users/me/device-tokens')
export class DeviceTokensController {
  constructor(private readonly deviceTokens: DeviceTokensService) {}

  @Post()
  @ApiOperation({ summary: 'Register or refresh an FCM device token for the current user' })
  register(
    @CurrentUser() user: Prisma.User,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.deviceTokens.register(user.id, dto.token, dto.platform);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an FCM device token for the current user' })
  remove(@CurrentUser() user: Prisma.User, @Body() dto: RemoveDeviceTokenDto) {
    return this.deviceTokens.remove(user.id, dto.token);
  }
}
