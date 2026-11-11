import { Global, Module } from '@nestjs/common';
import { STORAGE_SERVICE_TOKEN } from './storage.tokens';
import { LocalStorageService } from './local-storage.service';
import { R2StorageService } from './r2-storage.service';
import type { StorageService } from './storage.interface';
import { StorageController } from './storage.controller';



export const storageProvider = {
  provide: STORAGE_SERVICE_TOKEN,
  useFactory: (): StorageService => {
    const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
    if (driver === 'r2') {
      return new R2StorageService();
    }
    return new LocalStorageService();
  }
};

/** 全局存储模块：按 STORAGE_DRIVER 环境变量选择 local / r2 实现 */
@Global()
@Module({
  providers: [storageProvider, StorageController],
  controllers: [StorageController],
  exports: [storageProvider]
})
export class StorageModule {}

export type { StorageService };
