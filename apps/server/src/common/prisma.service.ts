import {
  INestApplication,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  // Nest 의 app.enableShutdownHooks() 는 SIGTERM 에 자동으로 onModuleDestroy 를
  // 트리거하므로 현재는 이 메서드가 없어도 된다. 다만 bootstrap 쪽에서 명시적으로
  // 호출하고 싶은 케이스가 있을 수 있어 남겨둔다 (deprecated 후보).
  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
