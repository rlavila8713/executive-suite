import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBackupJson } from '../src/lib/backup.ts';
import { DEFAULT_APP_SETTINGS } from '../src/constants.ts';

describe('parseBackupJson', () => {
  it('accepts schema version 6 with warehouse fields', () => {
    const payload = {
      schemaVersion: 6,
      exportedAt: new Date().toISOString(),
      app: 'executive-suite',
      products: [
        {
          id: 'p1',
          name: 'Test',
          sku: 'T-1',
          category: 'G',
          price: 9,
          cost: 3,
          warehouseCost: 3.5,
          stock: 2,
          image: '',
          categoryId: '',
          subcategoryId: '',
          subcategory: '',
          status: 'active',
          unitOfMeasure: 'unidad',
          locationId: null,
          barcode: null,
        },
      ],
      transactions: [],
      expenses: [],
      appSettings: { ...DEFAULT_APP_SETTINGS, id: 'main' },
      warehouses: [{ id: 'w1', name: 'Main', isDefault: true, createdAt: 1, updatedAt: 1 }],
      warehouseSections: [{ id: 's1', warehouseId: 'w1', name: 'General', isSystem: true, createdAt: 1 }],
      warehouseStock: [
        {
          id: 'ws1',
          warehouseId: 'w1',
          sectionId: 's1',
          productId: 'p1',
          quantity: 5,
          unitCost: 3.5,
          updatedAt: 1,
          sectionName: 'General',
          productName: 'Test',
          productSku: 'T-1',
        },
      ],
      warehouseMovements: [],
    };
    const parsed = parseBackupJson(JSON.stringify(payload));
    assert.equal(parsed.schemaVersion, 6);
    assert.equal(parsed.products[0].warehouseCost, 3.5);
    assert.equal(parsed.warehouseStock?.[0].quantity, 5);
  });

  it('accepts schema version 9 with suppliers and purchaseOrders optional', () => {
    const payload = {
      schemaVersion: 9,
      exportedAt: new Date().toISOString(),
      app: 'executive-suite',
      products: [
        {
          id: 'p1',
          name: 'Test',
          sku: 'T-1',
          category: 'G',
          price: 9,
          cost: 3,
          warehouseCost: 0,
          stock: 0,
          image: '',
        },
      ],
      transactions: [],
      expenses: [],
      appSettings: { ...DEFAULT_APP_SETTINGS, id: 'main' },
      suppliers: [
        {
          id: 'sup-1',
          name: 'Proveedor A',
          address: '',
          phone: '',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      purchaseOrders: [
        {
          id: 'po-1',
          purchasedAt: 1_700_000_000_000,
          supplierId: 'sup-1',
          supplierName: 'Proveedor A',
          invoiceNumber: '',
          notes: '',
          lines: [
            {
              id: 'line-1',
              purchaseId: 'po-1',
              productId: null,
              name: 'Línea',
              barcode: '',
              unitCost: 2,
              quantity: 3,
              unitOfMeasure: 'unidad',
              warehouseReceivedQty: 0,
            },
          ],
          status: 'draft',
          totalCost: 6,
          warehousePostedAt: null,
          submittedForReviewAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const parsed = parseBackupJson(JSON.stringify(payload));
    assert.equal(parsed.schemaVersion, 9);
    assert.equal(parsed.suppliers?.[0].name, 'Proveedor A');
    assert.equal(parsed.purchaseOrders?.[0].lines.length, 1);
  });
});
