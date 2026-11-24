import {mkdir} from 'node:fs/promises';
import sharp from 'sharp';

const outputDirectory = 'public/screenshots';

const escapeXml = (value) =>
  value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]);

const card = ({x, y, width, height, label, value, accent = '#2563eb'}) => `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#ffffff" stroke="#e5e7eb"/>
  <rect x="${x}" y="${y + height - 4}" width="${width}" height="4" rx="2" fill="${accent}"/>
  <text x="${x + 16}" y="${y + 25}" class="eyebrow">${escapeXml(label)}</text>
  <text x="${x + 16}" y="${y + 60}" class="stat">${escapeXml(value)}</text>
`;

const nav = (active) => `
  <rect x="18" y="754" width="354" height="54" rx="22" fill="#ffffff" stroke="#e5e7eb"/>
  ${[
    ['Home', 58],
    ['Tenants', 146],
    ['Money', 234],
    ['Settings', 322],
  ].map(([label, x]) => `
    <circle cx="${x}" cy="774" r="7" fill="${label === active ? '#2563eb' : '#d1d5db'}"/>
    <text x="${x}" y="796" class="${label === active ? 'nav active' : 'nav'}" text-anchor="middle">${label}</text>
  `).join('')}
`;

const shell = ({eyebrow, title, subtitle, body, active = 'Home'}) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
    <style>
      text { font-family: Arial, sans-serif; fill: #0f172a; }
      .brand { font-size: 13px; font-weight: 800; letter-spacing: 1.6px; }
      .eyebrow { font-size: 9px; font-weight: 800; letter-spacing: 1.1px; fill: #64748b; }
      .title { font-size: 29px; font-weight: 800; letter-spacing: -1.1px; }
      .subtitle { font-size: 11px; font-weight: 600; fill: #64748b; }
      .stat { font-size: 24px; font-weight: 800; letter-spacing: -0.8px; }
      .section { font-size: 13px; font-weight: 800; }
      .row { font-size: 11px; font-weight: 700; }
      .muted { font-size: 10px; font-weight: 600; fill: #94a3b8; }
      .nav { font-size: 8px; font-weight: 700; fill: #94a3b8; }
      .active { fill: #2563eb; }
    </style>
    <rect width="390" height="844" fill="#f8fafc"/>
    <rect width="390" height="70" fill="#ffffff"/>
    <path d="M24 43V24l10-8 10 8v19M29 43V28h10v15M20 43h28" fill="none" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round"/>
    <text x="60" y="31" class="brand">MYBOMA</text>
    <text x="60" y="48" class="eyebrow">PROPERTY OS</text>
    <circle cx="354" cy="34" r="16" fill="#2563eb"/>
    <text x="354" y="39" text-anchor="middle" style="font-size:12px;font-weight:800;fill:#fff">U</text>
    <text x="20" y="104" class="eyebrow">${escapeXml(eyebrow)}</text>
    <text x="20" y="139" class="title">${escapeXml(title)}</text>
    <text x="20" y="162" class="subtitle">${escapeXml(subtitle)}</text>
    ${body}
    ${nav(active)}
  </svg>
`;

const previews = [
  {
    output: 'mobile-dashboard.webp',
    svg: shell({
      eyebrow: 'OWNER VERIFIED',
      title: 'Command Center',
      subtitle: 'Portfolio health at a glance',
      body: `
        ${card({x: 18, y: 190, width: 171, height: 90, label: 'RENT COLLECTED', value: '128k', accent: '#2563eb'})}
        ${card({x: 201, y: 190, width: 171, height: 90, label: 'OCCUPANCY', value: '92%', accent: '#10b981'})}
        ${card({x: 18, y: 292, width: 171, height: 90, label: 'PENDING RENT', value: '4', accent: '#f59e0b'})}
        ${card({x: 201, y: 292, width: 171, height: 90, label: 'ACTIVE UNITS', value: '18', accent: '#ef4444'})}
        <rect x="18" y="398" width="354" height="186" rx="22" fill="#ffffff" stroke="#e5e7eb"/>
        <text x="36" y="430" class="eyebrow">MONTHLY COLLECTION</text>
        <text x="36" y="461" class="stat">KES 128,400</text>
        <path d="M44 545L96 518L146 528L198 489L248 502L300 462L346 474" fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M44 545L96 518L146 528L198 489L248 502L300 462L346 474L346 562L44 562Z" fill="#dbeafe" opacity=".75"/>
        <text x="20" y="624" class="section">Recent rent</text>
        <rect x="18" y="642" width="354" height="92" rx="20" fill="#ffffff" stroke="#e5e7eb"/>
        <circle cx="46" cy="675" r="14" fill="#dcfce7"/><text x="72" y="672" class="row">Kilimani Studio</text><text x="72" y="689" class="muted">Paid today</text><text x="344" y="678" text-anchor="end" class="row">KES 24k</text>
        <line x1="34" y1="706" x2="356" y2="706" stroke="#f1f5f9"/>
        <circle cx="46" cy="720" r="14" fill="#fef3c7"/><text x="72" y="723" class="row">Westlands 2BR</text><text x="344" y="723" text-anchor="end" class="row">KES 38k</text>
      `,
    }),
  },
  {
    output: 'mobile-tenants.webp',
    svg: shell({
      eyebrow: 'TENANT OPERATIONS',
      title: 'People & Rent',
      subtitle: 'Keep every tenancy organized',
      active: 'Tenants',
      body: `
        <rect x="18" y="190" width="354" height="56" rx="18" fill="#ffffff" stroke="#e5e7eb"/>
        <circle cx="48" cy="218" r="13" fill="#eef2ff"/><text x="72" y="214" class="row">Search tenants...</text><text x="72" y="231" class="muted">18 active records</text>
        <text x="20" y="285" class="section">Tenant registry</text>
        ${[
          ['JM', 'Jane Mwangi', 'Kilimani Studio', '#dbeafe', 'Paid'],
          ['DO', 'David Otieno', 'Westlands 2BR', '#dcfce7', 'Paid'],
          ['AN', 'Amina Noor', 'Lavington Loft', '#fef3c7', 'Due'],
          ['PK', 'Peter Kimani', 'Parklands 1BR', '#fce7f3', 'Paid'],
        ].map(([initials, name, unit, color, status], index) => {
          const y = 304 + (index * 83);
          const badge = status === 'Paid' ? '#dcfce7' : '#fef3c7';
          const text = status === 'Paid' ? '#15803d' : '#b45309';
          return `
            <rect x="18" y="${y}" width="354" height="70" rx="18" fill="#ffffff" stroke="#e5e7eb"/>
            <circle cx="50" cy="${y + 35}" r="18" fill="${color}"/>
            <text x="50" y="${y + 39}" text-anchor="middle" style="font-size:10px;font-weight:800">${initials}</text>
            <text x="80" y="${y + 30}" class="row">${name}</text>
            <text x="80" y="${y + 48}" class="muted">${unit}</text>
            <rect x="309" y="${y + 25}" width="46" height="21" rx="10" fill="${badge}"/>
            <text x="332" y="${y + 39}" text-anchor="middle" style="font-size:9px;font-weight:800;fill:${text}">${status}</text>
          `;
        }).join('')}
        <rect x="18" y="660" width="354" height="66" rx="20" fill="#0f172a"/>
        <text x="40" y="689" style="font-size:13px;font-weight:800;fill:#ffffff">Invite a tenant</text>
        <text x="40" y="708" style="font-size:10px;font-weight:600;fill:#94a3b8">Add them by email in seconds</text>
        <circle cx="338" cy="693" r="16" fill="#2563eb"/><text x="338" y="699" text-anchor="middle" style="font-size:20px;font-weight:700;fill:#fff">+</text>
      `,
    }),
  },
  {
    output: 'mobile-insights.webp',
    svg: shell({
      eyebrow: 'LIVE REPORTING',
      title: 'Portfolio Insights',
      subtitle: 'Decisions backed by clear numbers',
      active: 'Money',
      body: `
        ${card({x: 18, y: 190, width: 171, height: 90, label: 'TOTAL REVENUE', value: '342k', accent: '#2563eb'})}
        ${card({x: 201, y: 190, width: 171, height: 90, label: 'NET YIELD', value: '78%', accent: '#10b981'})}
        <rect x="18" y="296" width="354" height="208" rx="22" fill="#ffffff" stroke="#e5e7eb"/>
        <text x="36" y="330" class="eyebrow">PORTFOLIO ALLOCATION</text>
        <circle cx="111" cy="411" r="52" fill="none" stroke="#e2e8f0" stroke-width="20"/>
        <circle cx="111" cy="411" r="52" fill="none" stroke="#2563eb" stroke-width="20" stroke-dasharray="145 330" transform="rotate(-90 111 411)"/>
        <circle cx="111" cy="411" r="52" fill="none" stroke="#10b981" stroke-width="20" stroke-dasharray="82 330" stroke-dashoffset="-145" transform="rotate(-90 111 411)"/>
        <circle cx="111" cy="411" r="52" fill="none" stroke="#f59e0b" stroke-width="20" stroke-dasharray="56 330" stroke-dashoffset="-227" transform="rotate(-90 111 411)"/>
        <text x="111" y="408" text-anchor="middle" class="stat">18</text><text x="111" y="426" text-anchor="middle" class="muted">UNITS</text>
        ${[
          ['Residential', '50%', '#2563eb'],
          ['Commercial', '28%', '#10b981'],
          ['Short stay', '17%', '#f59e0b'],
          ['Vacant', '5%', '#cbd5e1'],
        ].map(([label, value, color], index) => `
          <circle cx="212" cy="${373 + (index * 28)}" r="5" fill="${color}"/>
          <text x="226" y="${377 + (index * 28)}" class="row">${label}</text>
          <text x="348" y="${377 + (index * 28)}" text-anchor="end" class="row">${value}</text>
        `).join('')}
        <rect x="18" y="520" width="354" height="205" rx="22" fill="#ffffff" stroke="#e5e7eb"/>
        <text x="36" y="554" class="eyebrow">SIX MONTH TREND</text>
        <path d="M44 677L96 642L146 654L198 608L248 621L300 580L346 594" fill="none" stroke="#10b981" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M44 677L96 642L146 654L198 608L248 621L300 580L346 594L346 695L44 695Z" fill="#d1fae5" opacity=".8"/>
      `,
    }),
  },
];

await mkdir(outputDirectory, {recursive: true});

for (const preview of previews) {
  await sharp(Buffer.from(preview.svg)).webp({quality: 88}).toFile(`${outputDirectory}/${preview.output}`);
}

console.log('Generated portrait mobile landing-page previews.');
