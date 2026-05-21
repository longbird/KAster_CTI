import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBranchMappingsDto } from './update-branch-mappings.dto';

describe('UpdateBranchMappingsDto', () => {
  it('rejects malformed branch routing policy rules', async () => {
    const dto = plainToInstance(UpdateBranchMappingsDto, {
      didIds: ['did-1'],
      settingsProfile: {
        routing: {
          enabled: true,
          representativeDidId: 'did-1',
          rules: [
            {
              queueId: 1001,
              conditionType: 'SOMETIMES',
            },
          ],
        },
      },
    });

    const errors = await validate(dto, { whitelist: true });

    expect(JSON.stringify(errors)).toContain('queueId must be a string');
    expect(JSON.stringify(errors)).toContain('conditionType must be one of the following values');
  });
});
