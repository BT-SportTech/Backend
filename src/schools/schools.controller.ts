import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateSchoolDto } from './dto/create-school.dto';
import { SchoolQueryDto } from './dto/school-query.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import {
  schoolLogoFileFilter,
  schoolLogoStorage,
} from './school-logo-upload.config';
import { SchoolsService } from './schools.service';

@ApiTags('schools')
@ApiBearerAuth('access-token')
@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Register a school (admin only)' })
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('upload-logo')
  @ApiOperation({ summary: 'Upload school logo image (admin only)' })
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
      storage: schoolLogoStorage,
      fileFilter: schoolLogoFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Logo image file is required');
    }

    return { url: `/uploads/school-logos/${file.filename}` };
  }

  @Get()
  @ApiOperation({
    summary: 'List schools with pagination and filters (public)',
    description:
      'Query params: page, limit, search, type, state, district, city, pincode, isActive',
  })
  findAll(@Query() query: SchoolQueryDto) {
    return this.schoolsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get school by id (public)' })
  findOne(@Param('id') id: string) {
    return this.schoolsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update school (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.schoolsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate school (admin only)' })
  deactivate(@Param('id') id: string) {
    return this.schoolsService.deactivate(id);
  }
}
