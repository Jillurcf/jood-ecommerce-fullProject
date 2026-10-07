import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Legal' };

export default function LegalPage() {
  return (
    <div className="container section">
      <h1 className="section-title" style={{ marginBottom: '1rem' }}>
        Legal / Terms
      </h1>
      <div className="card" style={{ padding: '1.5rem', maxWidth: '760px' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Terms of Service</h3>
        <p style={{ marginBottom: '1rem' }}>
          By using the JOODstore you agree to purchase products in accordance with the
          listed prices and stock availability. All prices are inclusive of applicable VAT.
        </p>
        <h3 style={{ marginBottom: '0.5rem' }}>Payments</h3>
        <p style={{ marginBottom: '1rem' }}>
          We accept Cash on Delivery (COD) and card payments processed securely by Stripe.
          Your card details are never stored on our servers in plain text.
        </p>
        <h3 style={{ marginBottom: '0.5rem' }}>Shipping</h3>
        <p>
          Shipping costs are calculated at checkout based on your delivery address and
          selected items.
        </p>
      </div>
    </div>
  );
}
