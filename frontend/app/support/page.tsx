import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Support' };

export default function SupportPage() {
  return (
    <div className="container section">
      <h1 className="section-title" style={{ marginBottom: '1rem' }}>
        Contact &amp; Support
      </h1>
      <div className="card" style={{ padding: '1.5rem', maxWidth: '640px' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Get in touch</h3>
        <p style={{ marginBottom: '1.25rem' }}>
          Our support team is here to help with orders, products, and returns. Reach us at:
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>Email:</strong> support@jood.example
        </p>
        <p>
          <strong>Hours:</strong> Mon–Sat, 9am–6pm
        </p>
      </div>
    </div>
  );
}
