import { HttpService } from "@nestjs/axios";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Connection } from "jsforce";
import { AxiosInstance } from "axios";
import { PersistanceService } from "./persistance.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";

export interface SfAuth {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

export interface ContactAccountPartial {
  attributes: ContactAccountPartialAttributes;
  OwnerId: string;
  Title: null;
  Email: string;
  Phone: string;
  Account: ContactAccountPartialAccount;
  CreatedDate: string;
  LastModifiedDate: string;
}

export interface ContactAccountPartialAccount {
  attributes: ContactAccountPartialAttributes;
  Name: string;
  AccountNumber: string;
  OwnerId: string;
  Website: string;
  ShippingAddress?: {
    city: string;
    country: string;
    postalCode: string;
    state: string;
    street: string;
  };
  Id: string;
}

export interface ContactAccountPartialAttributes {
  type: string;
  url: string;
}

@Injectable()
export class SfService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly username: string;
  private readonly password: string;
  private readonly axios: AxiosInstance;
  private jsForce: Connection | undefined;
  private pollMilliseconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly persistanceService: PersistanceService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {
    this.axios = this.httpService.axiosRef;
    this.clientId = this.configService.get<string>('SALESFORCE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>(
      'SALESFORCE_CLIENT_SECRET',
    );
    this.username = this.configService.get<string>('SALESFORCE_USERNAME');
    this.password = this.configService.get<string>('SALESFORCE_PASSWORD');
    this.pollMilliseconds = this.configService.get<number>('POLL_INTERVAL');
  }

  async oauth() {
    const token = await this.authenticate();
    this.logger.info(`SfService : int : token: ${JSON.stringify(token)}`);
    this.jsForce = new Connection({
      instanceUrl: token.instance_url,
      accessToken: token.access_token,
    });
  }

  async authenticate(): Promise<SfAuth> {
    const url = `https://login.salesforce.com/services/oauth2/token`;
    const data = {
      grant_type: 'password',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      username: this.username,
      password: this.password,
    };
    const response = await this.axios.post(url, null, { params: data });
    return response.data;
  }

  initial = true;
  private getFromTimeStamp() {
    if (!this.initial) {
      const currentDate = new Date();
      const startDate = new Date(currentDate.getTime() - this.pollMilliseconds);
      const startDateString = startDate.toISOString().slice(0, 19) + 'Z'; // e.g. "2023-05-28T12:34:56Z"
      this.persistanceService.setLastSync(startDateString);
      return startDateString;
    } else {
      this.initial = false;
      return (
        this.persistanceService.getLastSync() ||
        new Date('2022-01-01').toISOString().slice(0, 19) + 'Z'
      );
    }
  }

  async fetchAllContactsAssociatedAccount(startDate?: string): Promise<
    Array<ContactAccountPartial>
  > {
    if(!startDate) {
      startDate = this.getFromTimeStamp();
    }
    const response = await this.jsForce.query(
      `SELECT OwnerId, Title, Email, Phone,  Account.Id, Account.Name,  Account.AccountNumber,  Account.OwnerId,  Account.Website,  Account.ShippingAddress, CreatedDate, LastModifiedDate, Account.CreatedDate, Account.LastModifiedDate FROM Contact WHERE (CreatedDate >= ${startDate} OR LastModifiedDate >= ${startDate}) OR (Account.CreatedDate >= ${startDate} OR Account.LastModifiedDate >= ${startDate}) `,
    );
    return response.records;
  }
}
