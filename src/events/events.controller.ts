import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import * as Prisma from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { EventQueryDto } from './dto/event-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  eventImageFileFilter,
  eventImageStorage,
} from './event-image-upload.config';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth('access-token')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create event as draft (admin)' })
  create(@Body() dto: CreateEventDto, @CurrentUser() user: Prisma.User) {
    return this.eventsService.create(dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('upload-image')
  @ApiOperation({ summary: 'Upload event cover image (admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: eventImageStorage,
      fileFilter: eventImageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Event image file is required');
    }
    return { url: `/uploads/event-images/${file.filename}` };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  @ApiOperation({ summary: 'List all events with filters (admin)' })
  findAll(@Query() query: EventQueryDto) {
    return this.eventsService.findAllAdmin(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Get('eligible')
  @ApiOperation({
    summary: 'List published events eligible for the current student',
  })
  findEligible(
    @CurrentUser() user: Prisma.User,
    @Query() query: EventQueryDto,
  ) {
    return this.eventsService.findEligible(user, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Get('me/registrations')
  @ApiOperation({ summary: 'List current student registrations' })
  myRegistrations(
    @CurrentUser() user: Prisma.User,
    @Query() query: EventQueryDto,
  ) {
    return this.eventsService.myRegistrations(user, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get event detail (admin or eligible student)' })
  findOne(@Param('id') id: string, @CurrentUser() user: Prisma.User) {
    return this.eventsService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update event (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish event (admin)' })
  publish(@Param('id') id: string) {
    return this.eventsService.publish(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark event completed (admin)' })
  complete(@Param('id') id: string) {
    return this.eventsService.complete(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel event (admin)' })
  cancel(@Param('id') id: string) {
    return this.eventsService.cancel(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post(':id/register')
  @ApiOperation({ summary: 'Register current student for an event' })
  register(@Param('id') id: string, @CurrentUser() user: Prisma.User) {
    return this.eventsService.register(id, user);
  }
}
