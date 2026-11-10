export default function Lockdown() {
  return (
    <main className="lockdown-page" aria-label="Domain listing">
      <div className="lockdown-artwork">
        <img src={`${import.meta.env.BASE_URL}lockdown-page.png`} alt="" aria-hidden="true" />
        <span className="lockdown-domain">hwrk.wpoint.xyz</span>
        <span className="lockdown-price">$1,543</span>
      </div>
      <section className="lockdown-mobile">
        <p className="lockdown-brand">spaceship</p>
        <p className="lockdown-eyebrow">Domain for sale</p>
        <h1>hwrk.wpoint.xyz</h1>
        <div className="lockdown-mobile-price">
          <span>Buy now</span>
          <strong>$1,543</strong>
        </div>
        <p className="lockdown-mobile-footer">You will be redirected to spaceship.com</p>
      </section>
    </main>
  );
}
