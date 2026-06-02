import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  billingMonthKey,
  currentBillingDueDate,
  propertyHasInvoiceForMonth,
  invoiceStatusForDueDate,
} from '../src/lib/rentInvoices';

describe('rentInvoices', () => {
  it('detects existing invoice for billing month', () => {
    const month = billingMonthKey(currentBillingDueDate());
    const payments = [
      {id: '1', propertyId: 'p1', tenantId: 'a@b.com', dueDate: `${month}-01`, status: 'pending'},
    ];
    assert.equal(propertyHasInvoiceForMonth(payments, 'p1', month), true);
    assert.equal(propertyHasInvoiceForMonth(payments, 'p2', month), false);
  });

  it('marks past due dates as overdue', () => {
    assert.equal(invoiceStatusForDueDate('2020-01-01', '2026-05-01'), 'overdue');
    assert.equal(invoiceStatusForDueDate('2099-12-01', '2026-05-01'), 'pending');
  });
});
