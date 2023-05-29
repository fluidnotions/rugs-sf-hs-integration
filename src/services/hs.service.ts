import { Inject, Injectable } from '@nestjs/common';
import { Client } from '@hubspot/api-client';
import {
  CollectionResponseWithTotalSimplePublicObjectForwardPaging as ContactsSearchResults,
  PublicObjectSearchRequest,
  BatchInputSimplePublicObjectBatchInput as ContactUpdateBatch,
} from '@hubspot/api-client/lib/codegen/crm/contacts';
import { BatchInputSimplePublicObjectBatchInput as CompanyUpdateBatch } from '@hubspot/api-client/lib/codegen/crm/companies';
import { ConfigService } from '@nestjs/config';
import { ContactAccountPartial } from './sf.service';
import {
  BatchInputPublicAssociation,
  BatchResponsePublicAssociation,
  PublicAssociation,
} from '@hubspot/api-client/lib/codegen/crm/associations';
import { PersistanceService } from './persistance.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

type ContactCompanyPair = {
  company: any;
  contact: any;
};

/***
 * FIXME: approach doesn`t deal with multiple contacts associated with a company
 */
@Injectable()
export class HsService {
  private client: Client;
  constructor(
    private readonly configService: ConfigService,
    private readonly persistanceService: PersistanceService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    const accessToken = this.configService.get<string>(`HS_PRIVATE_APP_KEY`);
    this.client = new Client({
      accessToken,
    });
  }

  async upsert(items: Array<ContactAccountPartial>) {
    const create: Array<ContactAccountPartial> = [];
    const update: Array<ContactAccountPartial> = [];
    for (let item of items) {
      if (item.Email) {
        if(new RegExp(/^[\w.+\-]+@[\w\-]+\.[a-z]{2,}$/i).test(item.Email)) {
          const exists = await this.contactExists(item.Email);
          if (exists) {
            update.push(item);
          } else {
            create.push(item);
          }
        }else{
          this.logger.error(`Email ${item.Email} is invalid, for item: ${JSON.stringify(item)}`);
        }
      } else {
        this.logger.info(`Email is null, for item: ${JSON.stringify(item)}`);
      }
    }
    if (update.length) {
      await this.batchUpdateCompaniesAndContacts(create);
    }
    if (create.length) {
      const pairs = this.mapContactAccountPartial(create);
      const settled = await Promise.allSettled(
        pairs.map((pair) => this.createCompanyWithAssociatedContact(pair)),
      );
      for(let result of settled) {
        if(result.status === `rejected`) {
          this.logger.error(`HsService : upsert : ${result.reason}`);
        }
      }
    }
  }

  private async createCompanyWithAssociatedContact({
    company,
    contact,
  }: ContactCompanyPair) {
   try {
     const createCompany = await this.client.crm.companies.basicApi.create({
       properties: company,
     });
     const companyId = createCompany.id;
     this.logger.info(
       `HsService : createCompanyWithAssociatedContact : companyId: ${companyId}`,
     );
     const createContact = await this.client.crm.contacts.basicApi.create({
       properties: contact,
     });
     const contactId = createContact.id;
     this.logger.info(
       `HsService : createCompanyWithAssociatedContact : contactId: ${contactId}`,
     );
     this.persistanceService.addSfHsEntry(
       company.salesforceaccountid,
       companyId,
       contactId,
     );
     const associationTypes = await this.client.crm.associations.typesApi.getAll(
       `company`,
       `contacts`,
     );
     const targetType = associationTypes.results.find((types) => {
       return types.name === `company_to_contact`;
     });
     if (!targetType) {
       throw new Error(
         `associationType for company_to_contact not found, unable to associate contact with company`,
       );
     }
 
     const assocInput = new BatchInputPublicAssociation();
     const ass = new PublicAssociation();
     ass.type = `company_to_contact`;
     ass._from = { id: companyId };
     ass.to = { id: contactId };
     assocInput.inputs = [ass];
     const assResult: BatchResponsePublicAssociation =
       await this.client.crm.associations.batchApi.create(
         `Companies`,
         `Contacts`,
         assocInput,
       );
     this.logger.info(
       `HsService : createCompanyWithAssociatedContact : assResult: ${JSON.stringify(
         assResult,
       )}`,
     );
   } catch (err: any) {
     this.logger.error(err)
     throw err
   }
  }

  private async batchUpdateCompaniesAndContacts(
    create: Array<ContactAccountPartial>,
  ) {
    const batch = this.mapContactAccountPartial(create);
    const companyBatch: CompanyUpdateBatch = {
      inputs: batch.map((i) => {
        return {
          hs_object_id: this.persistanceService.getHsIds(
            i.company.salesforceaccountid,
          ),
          ...i.company,
        };
      }),
    };
    this.logger.info(
      `HsService : batchUpdateCompaniesAndContacts : companyBatch.inputs.length: ${companyBatch.inputs.length}`,
    );
    const companyCreateBatchResult =
      await this.client.crm.companies.batchApi.update(companyBatch);
    this.logger.info(
      `HsService : batchUpdateCompaniesAndContacts : companyCreateBatchResult: ${JSON.stringify(
        companyCreateBatchResult,
      )}`,
    );
    const contactBatch: ContactUpdateBatch = {
      inputs: batch.map((i) => {
        return {
          hs_object_id: this.persistanceService.getHsIds(
            i.contact.salesforceaccountid,
          ),
          ...i.contact,
        };
      }),
    };
    this.logger.info(
      `HsService : batchUpdateCompaniesAndContacts : contactBatch.inputs.length: ${contactBatch.inputs.length}`,
    );
    const contactCreateBatchResult =
      await this.client.crm.contacts.batchApi.update(contactBatch);
    this.logger.info(
      `HsService : batchUpdateCompaniesAndContacts : contactCreateBatchResult: ${JSON.stringify(
        contactCreateBatchResult,
      )}`,
    );
  }

  private mapContactAccountPartial(
    items: Array<ContactAccountPartial>,
  ): Array<ContactCompanyPair> {
    return items.map((item: ContactAccountPartial) => {
      let address = null;
      if (item.Account.ShippingAddress) {
        address = Object.values(item.Account.ShippingAddress).join(`, `);
      }
      const company = {
        name: item.Account.Name,
        address: address,
        website: item.Account.Website,
        salesforceaccountid: item.Account.Id,
      };
      const contact = {
        email: item.Email,
        phone: item.Phone,
        salesforceaccountid: item.Account.Id,
      };
      return {
        company,
        contact,
      } as unknown as { company: any; contact: any };
    });
  }

  private async contactExists(email: string) {
    const publicObjectSearchRequest: PublicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: `email`,
              operator: `EQ`,
              value: email,
            },
          ],
        },
      ],
      sorts: [`createdate`],
      query: email,
      properties: [`email`],
      limit: 10,
      after: 0,
    };
    const results: ContactsSearchResults =
      await this.client.crm.contacts.searchApi.doSearch(
        publicObjectSearchRequest,
      );
    this.logger.info(
      `HsService : contactExists : ${email} : results.total: ${results.total}`,
    );
    return !!results.total;
  }
}
