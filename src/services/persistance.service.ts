import { Inject, Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'fs';
import { Interval } from '@nestjs/schedule';
import { join, resolve } from 'path';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

const path = resolve(join(__dirname, '../data/sf-hs-dict.json'));

export type ContactCompanyHsIds = {
  companyHsObjectId: string;
  contactHsObjectId: string;
};
export type Storage = {
  lastSync: string;
  dict: { [sfId: string]: ContactCompanyHsIds };
};

/**
 * simple file persistence seems to be required since this is unidirectional from sf with the need for
 * batch updates which require an hs_object_id
 */
@Injectable()
export class PersistanceService {
  private storage: Storage;
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.storage = JSON.parse(readFileSync(path).toString());
  }

  @Interval(10000)
  private saveToFile() {
    writeFileSync(path, JSON.stringify(this.storage));
  }

  getLastSync() {
    return this.storage.lastSync;
  }

  setLastSync(date: string) {
    this.storage.lastSync = date;
  }

  getHsIds(sfId: string) {
    return this.storage.dict[sfId];
  }

  addSfHsEntry(
    sfAccId: string,
    companyHsObjectId: string,
    contactHsObjectId: string,
  ) {
    this.storage.dict[sfAccId] = {
      companyHsObjectId,
      contactHsObjectId,
    };
  }
}
