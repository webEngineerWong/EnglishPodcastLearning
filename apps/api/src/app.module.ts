import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { CoursesModule } from './courses/courses.module';
import { UploadsModule } from './uploads/uploads.module';
import { ImportModule } from './import/import.module';
import { ProgressModule } from './progress/progress.module';
import { StatsModule } from './stats/stats.module';
import { FavoritesModule } from './favorites/favorites.module';
import { VocabularyModule } from './vocabulary/vocabulary.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    PrismaModule,
    StorageModule,
    UsersModule,
    CategoriesModule,
    CoursesModule,
    UploadsModule,
    ImportModule,
    ProgressModule,
    StatsModule,
    FavoritesModule,
    VocabularyModule
  ]
})
export class AppModule {}
