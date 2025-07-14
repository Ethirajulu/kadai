import { faker } from '@faker-js/faker';
import { SellerProfileTestData, TestDataFactoryConfig } from '../../types';

export class SellerProfileDataFactory {
  constructor(private config?: TestDataFactoryConfig) {}

  generateSellerProfile(overrides?: Partial<SellerProfileTestData>): SellerProfileTestData {
    if (this.config?.seed) {
      faker.seed(this.config.seed);
    }

    const businessTypes = [
      'Individual',
      'Private Limited',
      'Partnership',
      'LLP',
      'Proprietorship',
      'Public Limited',
      'NGO',
      'Trust',
    ];

    const businessName = faker.company.name();
    const businessType = faker.helpers.arrayElement(businessTypes);
    const gstNumber = faker.datatype.boolean({ probability: 0.7 })
      ? `${faker.number.int({ min: 10, max: 37 })}${faker.string.alphanumeric(13).toUpperCase()}`
      : undefined;

    return {
      userId: faker.string.uuid(),
      businessName,
      businessType,
      gstNumber,
      businessAddress: faker.location.streetAddress({ useFullAddress: true }),
      businessPhone: faker.phone.number(),
      businessEmail: faker.internet.email(),
      isVerified: faker.datatype.boolean({ probability: 0.6 }),
      ...overrides,
    };
  }

  generateSellerProfiles(
    count: number,
    overrides?: Partial<SellerProfileTestData>
  ): SellerProfileTestData[] {
    return Array.from({ length: count }, () => this.generateSellerProfile(overrides));
  }

  generateVerifiedSeller(overrides?: Partial<SellerProfileTestData>): SellerProfileTestData {
    return this.generateSellerProfile({
      isVerified: true,
      gstNumber: `${faker.number.int({ min: 10, max: 37 })}${faker.string.alphanumeric(13).toUpperCase()}`,
      ...overrides,
    });
  }

  generateUnverifiedSeller(overrides?: Partial<SellerProfileTestData>): SellerProfileTestData {
    return this.generateSellerProfile({
      isVerified: false,
      gstNumber: undefined,
      ...overrides,
    });
  }

  generateIndividualSeller(overrides?: Partial<SellerProfileTestData>): SellerProfileTestData {
    return this.generateSellerProfile({
      businessType: 'Individual',
      businessName: faker.person.fullName(),
      gstNumber: undefined,
      ...overrides,
    });
  }

  generateCompanySeller(overrides?: Partial<SellerProfileTestData>): SellerProfileTestData {
    return this.generateSellerProfile({
      businessType: faker.helpers.arrayElement(['Private Limited', 'Public Limited']),
      businessName: `${faker.company.name()} ${faker.helpers.arrayElement(['Ltd.', 'Pvt. Ltd.', 'Inc.'])}`,
      gstNumber: `${faker.number.int({ min: 10, max: 37 })}${faker.string.alphanumeric(13).toUpperCase()}`,
      isVerified: faker.datatype.boolean({ probability: 0.8 }),
      ...overrides,
    });
  }

  generateSellersByBusinessType(
    businessType: string,
    count: number,
    overrides?: Partial<SellerProfileTestData>
  ): SellerProfileTestData[] {
    return Array.from({ length: count }, () =>
      this.generateSellerProfile({
        businessType,
        ...overrides,
      })
    );
  }

  generateSellersForUser(
    userId: string,
    overrides?: Partial<SellerProfileTestData>
  ): SellerProfileTestData {
    return this.generateSellerProfile({
      userId,
      ...overrides,
    });
  }

  generateSellersWithGST(
    count: number,
    overrides?: Partial<SellerProfileTestData>
  ): SellerProfileTestData[] {
    return Array.from({ length: count }, () =>
      this.generateSellerProfile({
        gstNumber: `${faker.number.int({ min: 10, max: 37 })}${faker.string.alphanumeric(13).toUpperCase()}`,
        businessType: faker.helpers.arrayElement(['Private Limited', 'Partnership', 'LLP']),
        isVerified: faker.datatype.boolean({ probability: 0.9 }),
        ...overrides,
      })
    );
  }

  generateSellersWithoutGST(
    count: number,
    overrides?: Partial<SellerProfileTestData>
  ): SellerProfileTestData[] {
    return Array.from({ length: count }, () =>
      this.generateSellerProfile({
        gstNumber: undefined,
        businessType: faker.helpers.arrayElement(['Individual', 'Proprietorship']),
        isVerified: faker.datatype.boolean({ probability: 0.4 }),
        ...overrides,
      })
    );
  }

  generateBulkSellers(
    options: {
      count: number;
      verifiedOnly?: boolean;
      withGST?: boolean;
      businessTypes?: string[];
    },
    overrides?: Partial<SellerProfileTestData>
  ): SellerProfileTestData[] {
    const { count, verifiedOnly, withGST, businessTypes } = options;

    return Array.from({ length: count }, () => {
      const baseSeller = this.generateSellerProfile(overrides);

      if (verifiedOnly) {
        baseSeller.isVerified = true;
      }

      if (withGST) {
        baseSeller.gstNumber = `${faker.number.int({ min: 10, max: 37 })}${faker.string.alphanumeric(13).toUpperCase()}`;
      } else if (withGST === false) {
        baseSeller.gstNumber = undefined;
      }

      if (businessTypes && businessTypes.length > 0) {
        baseSeller.businessType = faker.helpers.arrayElement(businessTypes);
      }

      return baseSeller;
    });
  }

  generateRegionalSellers(
    count: number,
    state: string,
    overrides?: Partial<SellerProfileTestData>
  ): SellerProfileTestData[] {
    const stateCodeMap: Record<string, string> = {
      'Andhra Pradesh': '37',
      'Arunachal Pradesh': '12',
      'Assam': '18',
      'Bihar': '10',
      'Chhattisgarh': '22',
      'Goa': '30',
      'Gujarat': '24',
      'Haryana': '06',
      'Himachal Pradesh': '02',
      'Jharkhand': '20',
      'Karnataka': '29',
      'Kerala': '32',
      'Madhya Pradesh': '23',
      'Maharashtra': '27',
      'Manipur': '14',
      'Meghalaya': '17',
      'Mizoram': '15',
      'Nagaland': '13',
      'Odisha': '21',
      'Punjab': '03',
      'Rajasthan': '08',
      'Sikkim': '11',
      'Tamil Nadu': '33',
      'Telangana': '36',
      'Tripura': '16',
      'Uttar Pradesh': '09',
      'Uttarakhand': '05',
      'West Bengal': '19',
    };

    const stateCode = stateCodeMap[state] || '27'; // Default to Maharashtra

    return Array.from({ length: count }, () =>
      this.generateSellerProfile({
        gstNumber: `${stateCode}${faker.string.alphanumeric(13).toUpperCase()}`,
        businessAddress: `${faker.location.streetAddress()}, ${faker.location.city()}, ${state}`,
        ...overrides,
      })
    );
  }
}