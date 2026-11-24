export const TERMS_VERSION = '2026-06-02';
export const PRIVACY_VERSION = '2026-06-02';

export const TERMS_OF_USE = {
  version: TERMS_VERSION,
  title: 'MyBoma Terms and Conditions',
  effectiveDate: 'June 2, 2026',
  sections: [
    {
      title: 'Acceptance of Terms',
      body: 'By creating an account or using MyBoma, you agree to these Terms of Use and any policies referenced in them. If you use MyBoma for a company, property owner, landlord, or tenant organization, you confirm that you are authorized to bind that organization.',
    },
    {
      title: 'Accounts and Eligibility',
      body: 'You must provide accurate account information, keep credentials confidential, and notify us of unauthorized access. You are responsible for activity under your account. MyBoma may suspend accounts used for fraud, abuse, unlawful activity, or security risk.',
    },
    {
      title: 'Property and Tenant Data',
      body: 'You are responsible for the accuracy and legality of property listings, tenant records, rent ledgers, maintenance requests, documents, and messages you upload or create. Do not upload content that infringes rights, violates law, or exposes sensitive information without authority.',
    },
    {
      title: 'Payments',
      body: 'MyBoma may support payments through third-party providers such as Stripe and M-Pesa. Payment availability depends on provider approval, account configuration, and local rules. Rent is only marked paid when the payment provider confirms a successful transaction through a trusted server-side callback or webhook.',
    },
    {
      title: 'Subscription Billing and Auto-Renewal',
      body: 'Current MyBoma landlord plans are prepaid for the monthly, quarterly, or yearly coverage period selected at checkout. They do not automatically renew, and MyBoma will not charge a renewal unless you actively authorize a new payment. If MyBoma offers an auto-renewing plan in the future, the checkout will clearly disclose the renewal price and frequency and ask for your consent before payment.',
    },
    {
      title: 'Cancellation',
      body: 'Current prepaid landlord plans expire at the end of the purchased coverage period, so no cancellation step is required to prevent a future subscription charge. You can stop using MyBoma by not renewing. Any future auto-renewing plan will include a simple cancellation option before the next charge. Account closure requests remain subject to record-retention obligations.',
    },
    {
      title: 'Waitlist and Marketing Emails',
      body: 'If you join the MyBoma waitlist, you agree to receive launch and important product emails. You can unsubscribe at any time through the unsubscribe link in a waitlist email or the unsubscribe form on the MyBoma website.',
    },
    {
      title: 'Landlord Settlement',
      body: 'Landlords are responsible for providing valid payment settlement details. M-Pesa and Stripe transfers may be delayed, rejected, reversed, or require additional verification by the payment provider. MyBoma records provider references for reconciliation but does not guarantee provider uptime.',
    },
    {
      title: 'Acceptable Use',
      body: 'You may not misuse the service, attempt unauthorized access, bypass rate limits, probe systems, upload malicious code, scrape data without permission, or use MyBoma for fraudulent, discriminatory, harassing, or illegal activity.',
    },
    {
      title: 'Service Changes',
      body: 'Features may change over time. We may update, suspend, or discontinue parts of the service when necessary for security, compliance, maintenance, or business reasons.',
    },
    {
      title: 'Disclaimers and Limitation of Liability',
      body: 'MyBoma is provided as a software platform and does not provide legal, financial, tax, or real-estate advice. To the maximum extent permitted by law, MyBoma is not liable for indirect, incidental, consequential, special, punitive, or lost-profit damages.',
    },
    {
      title: 'Changes to Terms',
      body: 'We may update these Terms. Continued use after an update means you accept the revised Terms. Material changes may require renewed acceptance in the app.',
    },
  ],
};

export const PRIVACY_POLICY = {
  version: PRIVACY_VERSION,
  title: 'MyBoma Privacy Policy',
  effectiveDate: 'June 2, 2026',
  sections: [
    {
      title: 'Information We Collect',
      body: 'We collect account information such as name, email, phone number, role, address, profile image, authentication metadata, property records, tenant records, rent payment records, maintenance requests, notifications, audit logs, and device or usage data needed to operate and secure the service. If you join the waitlist, we collect your email address, sign-up source, consent time, and subscription status.',
    },
    {
      title: 'How We Use Information',
      body: 'We use information to provide the app, authenticate users, manage properties and rent ledgers, process payments, notify landlords and tenants, prevent fraud, monitor security, debug errors, comply with law, and improve reliability.',
    },
    {
      title: 'Payments and Providers',
      body: 'Payment details are processed by third-party payment providers such as Stripe and M-Pesa. MyBoma stores payment status, references, metadata needed for reconciliation, and settlement status. We do not store full card numbers or payment provider secret keys in the client app.',
    },
    {
      title: 'Error Tracking and Diagnostics',
      body: 'We may use Sentry or similar tools to collect diagnostic events, stack traces, device/browser information, release data, and performance telemetry. We configure these tools to avoid intentionally sending payment secrets, passwords, or unnecessary personal data.',
    },
    {
      title: 'Sharing',
      body: 'We share information with service providers that help operate MyBoma, including hosting, database, authentication, payment, email, and error-monitoring providers. We may also share information when required by law, to protect rights and safety, or with your organization as part of property management workflows.',
    },
    {
      title: 'Security',
      body: 'We use technical and organizational safeguards such as server-side validation, access controls, rate limits, webhook signature checks, environment-based secret handling, HTTPS-oriented deployment, audit logging, and least-privilege operational practices. No system can be guaranteed completely secure.',
    },
    {
      title: 'Retention',
      body: 'We retain information for as long as needed to provide the service, satisfy legal and accounting obligations, resolve disputes, enforce agreements, and preserve audit trails. Retention periods may vary by data type and account status.',
    },
    {
      title: 'Your Choices',
      body: 'You may update account information in the app. You can stop waitlist and marketing emails at any time through the unsubscribe link in an email or the unsubscribe form on the website. Depending on your location and role, you may request access, correction, deletion, or export of personal information, subject to legal, security, and accounting limits.',
    },
    {
      title: 'Contact',
      body: 'For privacy or account questions, contact the MyBoma administrator or support contact configured for your deployment.',
    },
  ],
};

export const LEGAL_DOCUMENTS = {
  terms: TERMS_OF_USE,
  privacy: PRIVACY_POLICY,
};
