import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { GamesModule } from './games/games.module';
import { MailModule } from './mail/mail.module';
import { OrganizersModule } from './organizers/organizers.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchoolsModule } from './schools/schools.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    AuthModule,
    SchoolsModule,
    UsersModule,
    EventsModule,
    GamesModule,
    OrganizersModule,
  ],
})
export class AppModule {}
