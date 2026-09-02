import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';

const BCRYPT_ROUNDS = 10;

/** 비밀번호 해시는 어떤 응답에도 실리지 않는다. */
const ADMIN_SELECT = {
  platformAdminId: true,
  loginId: true,
  displayName: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
};

/** 두 번째 계정부터는 화면에서 만든다 (설계 §8.1). 부트스트랩 env 는 첫 계정 전용이다. */
@Injectable()
export class PlatformAdminsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return (this.prisma as any).platformAdmins.findMany({
      select: ADMIN_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreatePlatformAdminDto) {
    const duplicate = await (this.prisma as any).platformAdmins.findUnique({
      where: { loginId: dto.loginId },
      select: { platformAdminId: true },
    });
    if (duplicate) {
      throw new ConflictException('이미 있는 로그인 ID 입니다.');
    }

    return (this.prisma as any).platformAdmins.create({
      data: {
        loginId: dto.loginId,
        displayName: dto.displayName,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        // 만든 사람이 아는 비밀번호는 운영 비밀번호가 아니다. 부트스트랩 계정과 같은 이유다.
        mustChangePassword: true,
      },
      select: ADMIN_SELECT,
    });
  }

  async setActive(platformAdminId: string, isActive: boolean, actingAdminId: string) {
    // 마지막 관리자가 자기를 끄면 아무도 로그인할 수 없다. 계정이 남아 있으니 부트스트랩도 돌지 않는다.
    if (!isActive && platformAdminId === actingAdminId) {
      throw new ConflictException('자기 계정은 비활성화할 수 없습니다.');
    }

    const target = await (this.prisma as any).platformAdmins.findUnique({
      where: { platformAdminId },
      select: { platformAdminId: true },
    });
    if (!target) {
      throw new NotFoundException('플랫폼 관리자를 찾을 수 없습니다.');
    }

    return (this.prisma as any).platformAdmins.update({
      where: { platformAdminId },
      data: { isActive },
      select: ADMIN_SELECT,
    });
  }
}
