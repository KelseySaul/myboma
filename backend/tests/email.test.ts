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
    assert.match(rendered.text, /Your invited role: Landlord/);
    assert.match(rendered.text, /Set up your account: https:\/\/myboma\.example\/invite\?token=one-time-token/);
  });
});
