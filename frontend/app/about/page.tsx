import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'About Us' };

export default function AboutPage() {
  return (
    <div className="container section">
      <h1 className="section-title" style={{ marginBottom: '1rem' }}>
        About Jood
      </h1>
      <div className="card" style={{ padding: '1.5rem', maxWidth: '760px' }}>
        <p style={{ marginBottom: '1rem' }}>
          Jood is a quality goods &amp; products store. Our mission is to bring you a
          curated selection of great products at fair prices, with a simple and reliable
          shopping experience.
        </p>
        <p style={{ marginBottom: '1rem' }}>
          Every product page shows transparent pricing with VAT included, clear stock
          availability, and detailed variant options so you always know exactly what
          you&rsquo;re buying.
        </p>
        <p>
          Have a question? Visit our <a href="/support">support page</a> and we&rsquo;ll be
          happy to help.
        </p>
      </div>
    </div>
  );
}
