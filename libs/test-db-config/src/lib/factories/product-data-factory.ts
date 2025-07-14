import { faker } from '@faker-js/faker';
import { ProductTestData, TestDataFactoryConfig } from '../../types';

export class ProductDataFactory {
  constructor(private config?: TestDataFactoryConfig) {}

  generateProduct(overrides?: Partial<ProductTestData>): ProductTestData {
    if (this.config?.seed) {
      faker.seed(this.config.seed);
    }

    const categories = [
      'Electronics',
      'Clothing',
      'Home & Garden',
      'Books',
      'Sports',
      'Beauty',
      'Toys',
      'Health',
      'Automotive',
      'Music',
    ];

    const productName = faker.commerce.productName();
    const category = faker.helpers.arrayElement(categories);
    const price = faker.commerce.price({ min: 10, max: 5000 });

    return {
      sellerId: faker.string.uuid(),
      name: productName,
      description: faker.commerce.productDescription(),
      price: parseFloat(price),
      currency: 'INR',
      stockQuantity: faker.number.int({ min: 0, max: 500 }),
      sku: faker.string.alphanumeric(8).toUpperCase(),
      category,
      images: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
        faker.image.urlPicsumPhotos({ width: 400, height: 400 })
      ),
      isActive: faker.datatype.boolean({ probability: 0.8 }),
      ...overrides,
    };
  }

  generateProducts(count: number, overrides?: Partial<ProductTestData>): ProductTestData[] {
    return Array.from({ length: count }, () => this.generateProduct(overrides));
  }

  generateElectronicsProduct(overrides?: Partial<ProductTestData>): ProductTestData {
    return this.generateProduct({
      category: 'Electronics',
      name: faker.helpers.arrayElement([
        'Smartphone',
        'Laptop',
        'Tablet',
        'Headphones',
        'Smart Watch',
        'Camera',
        'Speaker',
        'Monitor',
      ]),
      price: faker.number.float({ min: 500, max: 50000, fractionDigits: 2 }),
      ...overrides,
    });
  }

  generateClothingProduct(overrides?: Partial<ProductTestData>): ProductTestData {
    return this.generateProduct({
      category: 'Clothing',
      name: faker.helpers.arrayElement([
        'T-Shirt',
        'Jeans',
        'Dress',
        'Jacket',
        'Shoes',
        'Shirt',
        'Pants',
        'Sweater',
      ]),
      price: faker.number.float({ min: 200, max: 5000, fractionDigits: 2 }),
      ...overrides,
    });
  }

  generateBookProduct(overrides?: Partial<ProductTestData>): ProductTestData {
    return this.generateProduct({
      category: 'Books',
      name: faker.lorem.words(3),
      description: faker.lorem.paragraph(),
      price: faker.number.float({ min: 50, max: 2000, fractionDigits: 2 }),
      ...overrides,
    });
  }

  generateOutOfStockProduct(overrides?: Partial<ProductTestData>): ProductTestData {
    return this.generateProduct({
      stockQuantity: 0,
      isActive: false,
      ...overrides,
    });
  }

  generateFeaturedProduct(overrides?: Partial<ProductTestData>): ProductTestData {
    return this.generateProduct({
      isActive: true,
      stockQuantity: faker.number.int({ min: 50, max: 500 }),
      price: faker.number.float({ min: 100, max: 10000, fractionDigits: 2 }),
      images: Array.from({ length: 5 }, () =>
        faker.image.urlPicsumPhotos({ width: 800, height: 600 })
      ),
      ...overrides,
    });
  }

  generateProductsBySeller(
    sellerId: string,
    count: number,
    overrides?: Partial<ProductTestData>
  ): ProductTestData[] {
    return Array.from({ length: count }, () =>
      this.generateProduct({
        sellerId,
        ...overrides,
      })
    );
  }

  generateProductsByCategory(
    category: string,
    count: number,
    overrides?: Partial<ProductTestData>
  ): ProductTestData[] {
    return Array.from({ length: count }, () =>
      this.generateProduct({
        category,
        ...overrides,
      })
    );
  }

  generateProductsWithPriceRange(
    count: number,
    minPrice: number,
    maxPrice: number,
    overrides?: Partial<ProductTestData>
  ): ProductTestData[] {
    return Array.from({ length: count }, () =>
      this.generateProduct({
        price: faker.number.float({ min: minPrice, max: maxPrice, fractionDigits: 2 }),
        ...overrides,
      })
    );
  }

  generateBulkProducts(
    options: {
      count: number;
      sellerId?: string;
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      ensureStock?: boolean;
    },
    overrides?: Partial<ProductTestData>
  ): ProductTestData[] {
    const { count, sellerId, category, minPrice, maxPrice, ensureStock } = options;

    return Array.from({ length: count }, () => {
      const baseProduct = this.generateProduct({
        sellerId,
        category,
        ...overrides,
      });

      if (minPrice !== undefined || maxPrice !== undefined) {
        baseProduct.price = faker.number.float({
          min: minPrice || 10,
          max: maxPrice || 10000,
          fractionDigits: 2,
        });
      }

      if (ensureStock) {
        baseProduct.stockQuantity = faker.number.int({ min: 1, max: 500 });
        baseProduct.isActive = true;
      }

      return baseProduct;
    });
  }

  generateRelatedProducts(
    baseProduct: ProductTestData,
    count: number,
    overrides?: Partial<ProductTestData>
  ): ProductTestData[] {
    return Array.from({ length: count }, () =>
      this.generateProduct({
        sellerId: baseProduct.sellerId,
        category: baseProduct.category,
        price: baseProduct.price! * faker.number.float({ min: 0.5, max: 2.0, fractionDigits: 2 }),
        ...overrides,
      })
    );
  }
}