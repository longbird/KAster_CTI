import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';

const FEATURE_KEY = 'recording-encryption';

/**
 * 암호화 자격이 켜진 테넌트가 있는데 서버가 암호화할 수 없는 상태를 기동 시 알린다.
 *
 * 자격은 한 번 켜면 끌 수 없게 막았지만, env 는 여전히 끌 수 있다 — env 가 최종 거부권이라
 * 구조상 그렇다. 그 상태로 두면 새 녹취가 조용히 평문으로 쌓이고, 나중에 "암호화 꺼져 있으니
 * 키도 필요 없겠지" 하고 키를 치우면 그 전 녹취를 영구히 읽을 수 없다 (보존 기본 1095일).
 *
 * **막지는 않는다.** 막으면 키를 잃은 사이트가 아예 못 뜨는데, 그건 더 나쁘다.
 */
@Injectable()
export class RecordingEncryptionWarningService implements OnModuleInit {
  private readonly logger = new Logger(RecordingEncryptionWarningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    void this.check();
  }

  async check(): Promise<void> {
    try {
      const enabledTenants = await (this.prisma as any).tenantFeatureEntitlements.count({
        where: { featureKey: FEATURE_KEY, enabled: true },
      });
      if (enabledTenants <= 0) return;

      const envEnabled = this.config.get<string>('RECORDING_ENCRYPTION_ENABLED', 'false') === 'true';
      const key = (this.config.get<string>('RECORDING_ENCRYPTION_KEY', '') ?? '').trim();

      if (!envEnabled) {
        this.logger.error(
          `녹취 암호화 자격이 켜진 테넌트가 ${enabledTenants}곳 있는데 RECORDING_ENCRYPTION_ENABLED 가 꺼져 있습니다. `
          + '새 녹취가 평문으로 쌓입니다. 그리고 기존 암호문을 읽으려면 RECORDING_ENCRYPTION_KEY 가 반드시 남아 있어야 합니다.',
        );
        return;
      }

      if (!key) {
        this.logger.error(
          `녹취 암호화 자격이 켜진 테넌트가 ${enabledTenants}곳 있는데 RECORDING_ENCRYPTION_KEY 가 비어 있습니다. `
          + '암호화도 복호도 실패합니다.',
        );
      }
    } catch (error) {
      // 기동 점검이 부팅을 막아서는 안 된다.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`녹취 암호화 설정 점검을 건너뜁니다: ${message}`);
    }
  }
}
