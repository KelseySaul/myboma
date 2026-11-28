import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  buildSubscriptionReminderContent,
  classifySubscriptionReminderMilestone,
  subscriberAccountType,
} from '../server/subscriptionReminderPolicy';
import {renderEmail} from '../server/services/email';

describe('automated landlord & property manager subscription reminders', () => {
  it('triggers only on clean renewal milestones (7d, 2d, due day, and 1/3/7 days post-expiry)', () => {
    assert.equal(classifySubscriptionReminderMilestone(7), '7_days');
    assert.equal(classifySubscriptionReminderMilestone(2), '2_days');
    assert.equal(classifySubscriptionReminderMilestone(0), 'due_today');
    assert.equal(classifySubscriptionReminderMilestone(-1), 'expired');
    assert.equal(classifySubscriptionReminderMilestone(-3), 'expired');
    assert.equal(classifySubscriptionReminderMilestone(-7), 'expired');

    // Non-milestone days should not spam
    assert.equal(classifySubscriptionReminderMilestone(14), null);
    assert.equal(classifySubscriptionReminderMilestone(3), null);
    assert.equal(classifySubscriptionReminderMilestone(1), null);
    assert.equal(classifySubscriptionReminderMilestone(-2), null);
    assert.equal(classifySubscriptionReminderMilestone(-30), null);
  });

  it('distinguishes Property Managers (Pro Plus / agency) from Landlords', () => {
    assert.equal(subscriberAccountType({role: 'admin', isSuperAdmin: false, subscriptionPlan: 'proplus:monthly'}), 'property_manager');
    assert.equal(subscriberAccountType({role: 'landlord', subscriptionPlan: 'proplus:yearly'}), 'property_manager');
    assert.equal(subscriberAccountType({role: 'landlord', subscriptionPlan: 'pro:monthly'}), 'landlord');
    assert.equal(subscriberAccountType({role: 'landlord', subscriptionPlan: 'starter:quarterly'}), 'landlord');
  });

  it('builds plain, clear renewal reminder emails with renewal amount and Renew button', () => {
    const content = buildSubscriptionReminderContent({
      displayName: 'Grace Wanjiku',
      accountType: 'property_manager',
      planKey: 'proplus:monthly',
      expiryDate: new Date('2026-12-05T09:00:00Z'),
      daysLeft: 2,
    });

    assert.equal(content.title, 'MyBoma subscription due in 2 days');
    assert.match(content.subject, /Agency \/ Enterprise/);
    assert.equal(content.template.button?.label, 'Renew subscription');

    const rendered = renderEmail(content.template);
    assert.match(rendered.html, /Property Manager/);
    assert.match(rendered.html, /Renew subscription/);
    assert.doesNotMatch(rendered.html, /gradient/i);
    assert.match(rendered.text, /Renewal amount: KES/);
  });
});
