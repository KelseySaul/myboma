import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  buildContactEmails,
  DEFAULT_SUPPORT_EMAIL,
  generateSupportTicketRef,
  publicContactSchema,
} from '../server/contactPolicy';

describe('interactive contact us enquiry policy', () => {
  it('validates guided contact selections plus name and email', () => {
    const parsed = publicContactSchema.safeParse({
      role: 'Landlord / Property Owner',
      topic: 'Pricing, plans & onboarding',
      detail: '11–20 units (Pro)',
      urgency: 'Normal (within 24 hours)',
      preferredContact: 'Email',
      name: 'Jane Wanjiku',
      email: 'jane@example.com',
    });
    assert.equal(parsed.success, true);

    const bad = publicContactSchema.safeParse({
      role: 'Landlord',
      topic: 'Pricing',
      detail: 'Pro',
      urgency: 'Normal',
      name: 'J',
      email: 'not-an-email',
    });
    assert.equal(bad.success, false);
  });

  it('generates readable support ticket references', () => {
    const ref = generateSupportTicketRef();
    assert.match(ref, /^MB-SUP-[A-F0-9]{6}$/);
  });

  it('builds both the support enquiry email and automated sender confirmation email', () => {
    const {toSupport, toSender} = buildContactEmails({
      input: {
        role: 'Property Manager / Agency',
        topic: 'Property manager / agency setup',
        detail: 'Onboarding 6–20 landlords',
        urgency: 'Urgent (today)',
        preferredContact: 'Email & Phone call',
        name: 'David Otieno',
        email: 'david@agency.co.ke',
        phone: '0712345678',
        note: 'Need a walkthrough tomorrow morning.',
      },
      ticketRef: 'MB-SUP-ABC123',
      appUrl: 'https://myboma.org',
    });

    assert.equal(toSupport.to, DEFAULT_SUPPORT_EMAIL);
    assert.equal(toSupport.replyTo, 'david@agency.co.ke');
    assert.ok(toSupport.subject.includes('MB-SUP-ABC123'));
    assert.ok(toSupport.subject.includes('David Otieno'));

    assert.equal(toSender.to, 'david@agency.co.ke');
    assert.equal(toSender.replyTo, DEFAULT_SUPPORT_EMAIL);
    assert.ok(toSender.subject.includes('MB-SUP-ABC123'));
    assert.ok(toSender.template?.paragraphs.some((p) => p.includes('Hi David') && p.includes('get back to you shortly')));
  });
});
