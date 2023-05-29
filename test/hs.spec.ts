import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { HsService } from '../src/services/hs.service';
const records = require('./data/records.json');

describe('HsService', () => {
  let app: INestApplication;
  let hs: HsService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    hs = app.get(HsService);
  });

  afterEach(async () => {
    await app.close();
  })

  xit('combined upsert', async () => {
    await hs.upsert(records);
  });
});
