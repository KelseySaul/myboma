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
    assert.equal(message.template.preheader?.includes('Landlord'), true);
    assert.deepEqual(message.template.callout, {label: 'Your invited role', value: 'Landlord'});

    const rendered = renderEmail(message.template);
    assert.match(rendered.html, /Account invitation/);
    assert.match(rendered.html, /Your invited role/);
    assert.match(rendered.html, /Landlord/);
    assert.match(rendered.html, /bomalog-white\.png/);
    assert.match(rendered.html, /#5B21B6/i);
    assert.match(rendered.html, /What to do next/);
    assert.match(rendered.html, /Button not opening\?/);
    assert.match(rendered.text, /Your invited role: Landlord/);
    assert.match(rendered.text, /Set up your account: https:\/\/myboma\.example\/invite\?token=one-time-token/);
  });

  it('renders tone-coded callouts, logo, steps, and clear CTA buttons for rent reminders', () => {
    const rendered = renderEmail({
      eyebrow: 'Rent reminder',
      tone: 'warning',
      heading: 'Rent Due in 2 Days',
      paragraphs: ['Your rent for Kilimani Heights A1 is due soon.'],
      callout: {label: 'Amount due', value: 'KES 48,000', sublabel: 'Due 1 Dec 2026'},
      details: [['Property', 'Kilimani Heights A1']],
      steps: ['Click the button below.', 'Pay via M-Pesa or card.'],
      button: {
        label: 'Pay rent on MyBoma',
        url: 'https://myboma.org',
        hint: 'Tap below to pay securely:',
      },
    });

    assert.match(rendered.html, /<img[^>]+bomalog-white\.png/);
    assert.match(rendered.html, /KES 48,000/);
    assert.match(rendered.html, /Pay rent on MyBoma/);
    assert.match(rendered.html, /#D97706/i);
    assert.match(rendered.text, /Pay rent on MyBoma: https:\/\/myboma\.org/);
  });
});
