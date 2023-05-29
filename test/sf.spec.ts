import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { SfService } from '../src/services/sf.service';
import { writeFileSync } from 'fs';
import { join } from 'path';

describe('SfService', () => {
  let app: INestApplication;
  let sf: SfService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    sf = app.get(SfService);
  });

  afterEach(async () => {
    await app.close();
  })

  xit('should respond with sf token', async () => {
    const response = await sf.authenticate();
    console.log('it : response:', response);
  });

  it('should get select fields on contact and associated account', async () => {
    await sf.oauth();
    const records = await sf.fetchAllContactsAssociatedAccount("2023-05-29T05:50:13.256Z");
    writeFileSync(
      join(__dirname, 'data', 'records.json'),
      JSON.stringify(records, null, 2),
    );
  });
});
