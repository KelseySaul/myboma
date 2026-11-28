import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {buildInviteEmail, renderEmail} from '../server/services/email';

describe('invitation email', () => {
  it('makes the invited role explicit in the subject, preview, HTML, and plain text', () => {
    const message = buildInviteEmail({
      to: 'new.landlord@example.com',
      inviterName: 'Kelsey Saul',
      role: 'landlord',
      url: 'https://myboma.example/invite?token=one-time-token',
      expiresAt: new Date('2026-12-01T12:00:00.000Z'),
    });

    assert.equal(message.subject, 'Kelsey Saul invited you to MyBoma as a Landlord');
    assert.ok(message.template);
    assert.deepEqual(message.template.callout, {label: 'Your role', value: 'Landlord'});

    const rendered = renderEmail(message.template);
    assert.match(rendered.html, /Landlord/);
    assert.match(rendered.html, /Set up your account/);
    assert.match(rendered.text, /Your role: Landlord/);
    assert.match(rendered.text, /Set up your account: https:\/\/myboma\.example\/invite\?token=one-time-token/);
  });

  it('renders a plain layout: logo, one button, no gradients or badges', () => {
    const rendered = renderEmail({
      heading: 'Rent due in 2 days',
      paragraphs: ['Your rent for Kilimani Heights A1 is due on 1 Dec.'],
      details: [['Amount', 'KES 48,000']],
      button: {label: 'Pay rent', url: 'https://myboma.org'},
    });

    assert.match(rendered.html, /<img[^>]+bomalog\.png/);
    assert.match(rendered.html, /Pay rent/);
    assert.doesNotMatch(rendered.html, /gradient/i);
    assert.doesNotMatch(rendered.html, /What to do next/);
    assert.match(rendered.text, /Pay rent: https:\/\/myboma\.org/);
  });
});
