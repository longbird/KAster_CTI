import { Test } from '@nestjs/testing';
import { CustomersController } from './customers.controller';
import { CustomersModule } from './customers.module';

describe('CustomersModule', () => {
  it('registers CustomersController with its dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CustomersModule],
    }).compile();

    expect(moduleRef.get(CustomersController)).toBeDefined();
  });
});
