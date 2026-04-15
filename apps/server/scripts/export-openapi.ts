// OpenAPI 3 문서를 docs/openapi.json 으로 내보낸다.
// 실행: `npm run openapi:export` (apps/server 디렉터리에서)
// SwaggerUI 는 /docs 에서 런타임으로 뜨지만, 이 정적 파일이 있어야
// 코드 생성 · CI 검증 · 외부 문서화에 쓰기 좋다.

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

async function main() {
  // DB/Redis/AMI 연결은 도큐먼트 생성에만 쓰는 이 스크립트에서 피할 수 없으므로
  // 로컬에서 postgres + redis 가 떠 있을 때만 실행 가능하다.
  // 후속: NoOp 대체 모듈을 만들어 스키마만 뽑도록 개선 가능.
  const app = await NestFactory.create(AppModule, { logger: false });

  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('KAster CTI API')
    .setDescription('Asterisk CTI middleware API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outPath = resolve(__dirname, '../../../docs/openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`openapi written to ${outPath}`);

  await app.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
