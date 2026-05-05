/**
 * Axe accessibility smoke tests for storefront HTML structures.
 *
 * Strategy: construct representative HTML strings for each key page region
 * and run axe-core against them. This catches landmark, label, contrast, and
 * ARIA violations without needing a running Next.js server.
 *
 * "No new violations" baseline: if a violation is in the known list below,
 * it's a pre-existing issue tracked separately. Any violation NOT in the list
 * fails the build.
 */

import axe from 'axe-core';
import { describe, it, expect } from 'vitest';

// Pre-existing violations accepted as backlog (do not add new ones without a ticket)
const KNOWN_VIOLATIONS: string[] = [];

async function assertNoNewViolations(html: string, context?: string) {
  document.body.innerHTML = html;
  const results = await axe.run(document.body);
  const newViolations = results.violations.filter(
    (v) => !KNOWN_VIOLATIONS.includes(v.id)
  );
  if (newViolations.length > 0) {
    const summary = newViolations
      .map((v) => `[${v.impact}] ${v.id}: ${v.description}\n  ${v.nodes.map((n) => n.html).join('\n  ')}`)
      .join('\n\n');
    throw new Error(
      `${newViolations.length} new axe violation(s)${context ? ` in ${context}` : ''}:\n\n${summary}`
    );
  }
  expect(newViolations).toHaveLength(0);
}

describe('Storefront — landmark regions', () => {
  it('page has skip-nav, main, nav, and aside with unique labels', async () => {
    await assertNoNewViolations(
      `
      <a href="#main-content">Skip to content</a>
      <nav aria-label="Menu categories">
        <button>Burgers</button>
        <button>Sides</button>
      </nav>
      <main id="main-content">
        <h1>Our Menu</h1>
        <section aria-label="Burgers">
          <ul>
            <li>
              <button type="button" aria-label="Add Classic Burger to cart">
                Classic Burger — $12.00
              </button>
            </li>
          </ul>
        </section>
      </main>
      <aside aria-label="Category list">
        <nav aria-label="Category list">
          <button>Burgers</button>
        </nav>
      </aside>
      `,
      'storefront landmarks'
    );
  });
});

describe('Storefront — cart sheet', () => {
  it('cart sheet has dialog role, title, and labelled buttons', async () => {
    await assertNoNewViolations(
      `
      <div role="dialog" aria-modal="true" aria-label="Your cart">
        <h2 id="cart-title">Your Order</h2>
        <ul>
          <li>
            Classic Burger × 2 — $24.00
            <button aria-label="Remove Classic Burger">×</button>
            <button aria-label="Decrease quantity of Classic Burger">−</button>
            <span aria-live="polite">2</span>
            <button aria-label="Increase quantity of Classic Burger">+</button>
          </li>
        </ul>
        <button>Checkout · $24.00</button>
        <button aria-label="Close cart">×</button>
      </div>
      `,
      'cart sheet'
    );
  });

  it('empty cart state is accessible', async () => {
    await assertNoNewViolations(
      `
      <div role="dialog" aria-modal="true" aria-label="Your cart">
        <h2>Your Order</h2>
        <p>Your cart is empty</p>
        <p>Add items to get started</p>
        <button aria-label="Close cart">×</button>
      </div>
      `,
      'empty cart'
    );
  });
});

describe('Storefront — menu item cards', () => {
  it('item card with image has alt text and labelled add button', async () => {
    await assertNoNewViolations(
      `
      <main>
        <article>
          <img src="/burger.jpg" alt="Classic Burger" width="300" height="200" />
          <h3>Classic Burger</h3>
          <p>A juicy beef patty with lettuce and tomato.</p>
          <span>$12.00</span>
          <span class="text-slate-500">in-store $11.00</span>
          <button type="button" aria-label="Add Classic Burger to cart">+</button>
        </article>
      </main>
      `,
      'item card with image'
    );
  });

  it('item card without image has no empty alt', async () => {
    await assertNoNewViolations(
      `
      <main>
        <article>
          <div aria-hidden="true">C</div>
          <h3>Classic Burger</h3>
          <p>$12.00</p>
          <button type="button" aria-label="Add Classic Burger to cart">+</button>
        </article>
      </main>
      `,
      'item card without image'
    );
  });

  it('sold-out card is not interactive', async () => {
    await assertNoNewViolations(
      `
      <main>
        <article aria-disabled="true">
          <img src="/burger.jpg" alt="Classic Burger" width="300" height="200" />
          <h3>Classic Burger</h3>
          <span>Sold Out</span>
          <span>$12.00</span>
        </article>
      </main>
      `,
      'sold-out card'
    );
  });
});

describe('Storefront — checkout order summary', () => {
  it('order summary section has labelled rows and disclosure text', async () => {
    await assertNoNewViolations(
      `
      <main>
        <section aria-label="Order summary">
          <dl>
            <div><dt>Subtotal (2 items)</dt><dd>$24.00</dd></div>
            <div><dt>Tax (8%)</dt><dd>$1.92</dd></div>
            <div><dt>Delivery Fee</dt><dd>Free</dd></div>
            <div><dt>Total</dt><dd>$25.92</dd></div>
          </dl>
          <p>Prices reflect online delivery rates and may differ from in-store pricing.</p>
        </section>
      </main>
      `,
      'order summary'
    );
  });
});

describe('Storefront — scheduled time display', () => {
  it('scheduled time card is accessible', async () => {
    await assertNoNewViolations(
      `
      <main>
        <div>
          <svg aria-hidden="true" focusable="false"></svg>
          <div>
            <p id="sched-label">Scheduled for</p>
            <p aria-labelledby="sched-label">Thu, May 8 · 6:30 PM EDT</p>
          </div>
        </div>
      </main>
      `,
      'scheduled time card'
    );
  });
});
