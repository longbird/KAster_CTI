import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

function parseCors(raw: string | undefined): string | string[] | true {
  if (!raw || raw === '*') return true;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Docker/systemd SIGTERM 시 Nest 의 onModuleDestroy 체인이 동작해
  // Prisma/Redis/AMI/WS 모두 graceful close 됨.
  app.enableShutdownHooks();

  // REST CORS — 프론트(apps/web:5173)와 관리자(apps/admin:5174)가 다른 origin.
  app.enableCors({
    origin: parseCors(config.get<string>('REST_CORS_ORIGIN')),
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 응답 래핑 + 예외 래핑. 컨트롤러가 이미 envelope 을 만들면 인터셉터는 pass-through.
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('KAster CTI API')
    .setDescription('Asterisk CTI middleware API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(config.get<string>('PORT', '3000'));
  await app.listen(port);
}

bootstrap();
