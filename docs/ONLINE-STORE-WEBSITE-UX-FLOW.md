# Online Store & Website: Final UX Flow

## Decision

DexaPOS should present **Online Store** and **Website** as two separate products with a deliberate connection between them.

- **Online Store** is the transaction engine. It owns the menu, prices, checkout, payments, fulfillment, and order operations.
- **Website** is the branded marketing layer. It tells the restaurant's story and routes visitors to the Online Store through an automatic **Order Online** destination.

This separation reflects how merchants think about their business: one area is for selling and fulfilling, while the other is for presentation and discovery.

## Product Boundary

| Product | Merchant question | Owns | Does not own |
| --- | --- | --- | --- |
| Online Store | “How do I sell and fulfill orders?” | Menu availability, online pricing, modifiers, hours, pickup, delivery, fees, taxes, payments, orders, QR ordering, integrations | Marketing pages, editorial content, general website design |
| Website | “How do I present my brand and bring people to my store?” | Homepage, pages, brand styling, gallery, story, locations, FAQ, SEO | Menu logic, prices, cart, checkout, payment, fulfillment rules |

## Merchant Flow

### 1. Configure the Online Store

The merchant starts in **Online Store** because it controls whether customers can actually buy.

1. Select a location.
2. Complete store basics: name, contact information, store URL, and legal/payment setup where applicable.
3. Configure the menu for online sale: availability, online prices, modifiers, images, and sold-out behavior.
4. Configure fulfillment: pickup, delivery, preparation time, minimum order, delivery fee, free-delivery threshold, delivery radius, and future ordering.
5. Set operating hours.
6. Configure advanced features only when needed: QR table ordering, delivery-channel integrations, notifications, and promotions.
7. Preview the customer storefront.
8. Run a test order.
9. Launch or pause the store.

The Online Store should include a visible readiness checklist. Launch should be blocked only by genuine operational requirements, such as no fulfillment method, no hours, incomplete payments, or no orderable menu items.

### 2. Build the Website

The merchant then uses **Website** to create a branded path into the store.

1. Choose or customize a page layout.
2. Add brand elements: logo, colors, photography, hero image, and voice.
3. Build pages such as Home, About, Locations, Gallery, FAQ, and Contact.
4. Add calls to action such as **Order Online**, **View Menu**, **Call**, or **Find Us**.
5. Preview desktop, tablet, and mobile layouts.
6. Publish the website.

Every **Order Online** button must automatically use the active Online Store URL. Merchants should choose the action; they should not paste, maintain, or troubleshoot storefront URLs.

## Customer Journey

```text
Website, social link, Google, or direct store link
                ↓
Restaurant Website (optional marketing layer)
                ↓
Customer selects “Order Online”
                ↓
Online Store
                ↓
Choose pickup or delivery, location, and time
                ↓
Browse menu → customize item → add to cart
                ↓
Review cart → checkout → payment
                ↓
Order confirmation and fulfillment status
                ↓
Reorder, loyalty, or feedback prompt
```

## Online Store Customer Flow

The online store should make fulfillment expectations clear before customers invest time in browsing.

1. Land on the branded online storefront.
2. Select or confirm location when multiple locations exist.
3. Select pickup or delivery and the desired time.
4. Immediately show the expected preparation/delivery time, availability, and applicable delivery fee.
5. Browse categories and menu items.
6. Open an item detail view to choose required modifiers first, then optional add-ons and notes.
7. Keep a persistent cart with item count and current total.
8. Allow a quick cart review without losing the menu context.
9. Use a concise checkout that shows fulfillment details, fees, taxes, tip, payment, and final total before placing the order.
10. Confirm the order with a clear status, promised time, order number, and fulfillment instructions.

## Navigation

### Online Store — Menu, Orders & Fulfillment

- Overview
- Menu
- Fulfillment & Hours
- Storefront & Branding
- Integrations, QR & Notifications
- Test Order
- Store Status: Live / Paused

### Website — Brand Site & Pages

- Pages
- Design
- Content
- SEO
- Preview
- Publish

## Cross-Product Connection

The products should be separate in navigation, but each should expose the relevant next action.

### In Website

- Offer an **Order Online** action type in buttons, navigation, and banners.
- Resolve that action automatically to the selected location's active Online Store.
- If the store is not live, show the merchant a clear setup prompt instead of publishing a broken order link.

### In Online Store

Show a compact **Promote your store** card containing:

- Store URL
- Copy link action
- QR code / download QR action
- Link to edit the Website
- Explanation that Website order buttons automatically open this store

## UX Rules

1. The Website never controls menu availability, pricing, checkout, payment, or fulfillment.
2. The Online Store never requires the Website to operate; merchants can sell using a direct store URL, QR code, or social link.
3. The Website must never require manual pasted URLs for the primary Order Online action.
4. Store status must be unambiguous: **Draft**, **Live**, or **Paused**. Avoid a bare toggle without readiness context.
5. Advanced commerce features—QR ordering, delivery channels, notifications, and analytics—must not compete with the first-time store-launch flow.
6. Test ordering belongs to the Online Store and should be a prominent pre-launch step.

## Recommended Labels

- **Online Store** — *Menu, orders & fulfillment*
- **Website** — *Your brand site & pages*

These names describe the outcome for merchants and keep the difference between the two areas clear.
