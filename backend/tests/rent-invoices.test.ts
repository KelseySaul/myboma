import assert from 'node:assert/strict';
import {before, describe, it} from 'node:test';
import {
  addMonthsToBillingDate,
  billingMonthKey,
  currentBillingDueDate,
  daysUntilDueDate,
  propertyHasInvoiceForMonth,
  invoiceStatusForDueDate,
} from '../../shared/rentInvoices';
import type * as SyncModule from '../server/rentInvoiceSync';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost/test';

let syncModule: typeof SyncModule;
before(async () => {
  syncModule = await import('../server/rentInvoiceSync');
});

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

  it('plans prepaid advance rent months so no arrears invoices fire during paid-up months', () => {
    const prop = {
      id: 'prop-1',
      landlordId: 'landlord-1',
      platformId: null,
      tenantId: 'tenant@example.com',
      price: 45000,
      status: 'rented',
      type: 'residential',
    };

    const oneMonth = syncModule.planInitialAssignmentInvoices(
      prop,
      'tenant@example.com',
      {depositPaid: true, depositAmount: 45000, prepaidMonths: 1, paymentMethod: 'mpesa', paymentReference: 'SKL999'},
      '2026-11-25',
    );
    assert.equal(oneMonth.paidRows.length, 1);
    assert.equal(oneMonth.paidRows[0].dueDate, '2026-11-25');
    assert.match(oneMonth.paidRows[0].manualNote, /Deposit KES 45,000 paid/);
    assert.equal(oneMonth.nextPendingDueDate, '2026-12-25');
    assert.equal(daysUntilDueDate(oneMonth.nextPendingDueDate, '2026-12-23'), 2);

    const threeMonths = syncModule.planInitialAssignmentInvoices(
      prop,
      'tenant@example.com',
      {prepaidMonths: 3, paymentMethod: 'bank'},
      '2026-11-25',
    );
    assert.deepEqual(
      threeMonths.paidRows.map((r) => r.dueDate),
      ['2026-11-25', '2026-12-25', '2027-01-25'],
    );
    assert.equal(threeMonths.nextPendingDueDate, addMonthsToBillingDate('2026-11-25', 3));
    assert.equal(threeMonths.nextPendingDueDate, '2027-02-25');
  });
});
