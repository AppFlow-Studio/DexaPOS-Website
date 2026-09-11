import type { Metadata } from "next";
import "../legal.css";

const EFFECTIVE_DATE = "September 11, 2026";

export const metadata: Metadata = {
  title: "Refund, Return and Shipping Policy",
  description:
    "DEXA POS AI LLC Refund, Return and Shipping Policy for products and services purchased directly from DEXA, including hardware, software subscriptions, professional services, and shipping.",
  openGraph: { title: "Refund, Return and Shipping Policy", url: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow">Legal</div>
          <h1>Refund, Return and Shipping Policy</h1>
          <p className="lede">
            DEXA POS AI LLC — Refund, Return and Shipping Policy for products and services purchased
            directly from DEXA.
          </p>
        </div>
      </section>

      <section className="legal">
        <div className="wrap">
          <div className="legal-meta">Effective Date: {EFFECTIVE_DATE}</div>

          <p className="legal-intro">
            This Policy applies to products and services purchased directly from DEXA POS AI LLC unless
            a signed order form, quote, invoice, warranty, promotional offer, or other written
            agreement states different terms. DEXA may serve merchants throughout the United States.
            Refund, return, warranty, and shipping rights may vary where applicable federal, state, or
            local law requires a different result.
          </p>

          <h2>1. General Refund Policy</h2>
          <p>
            All sales are final. DEXA generally does not provide refunds, returns, or credits after
            products or services have been purchased, activated, configured, installed, performed, or
            delivered. DEXA may consider exceptions in limited or extenuating circumstances on a
            case-by-case basis. Any exception is discretionary and does not create an obligation to
            provide the same exception in the future. Nothing in this Policy limits any right or remedy
            that cannot lawfully be waived under applicable federal, state, or local law.
          </p>

          <h2>2. Hardware — Final Sale</h2>
          <p>
            Hardware purchases are final sale and are generally non-refundable and non-returnable. POS
            equipment may be ordered, configured, programmed, provisioned, paired, or otherwise prepared
            for a particular merchant. DEXA therefore does not ordinarily accept hardware returns due to
            change of mind, cancellation of service, business closure, or a merchant decision not to use
            the equipment. A hardware return, exchange, credit, or refund will be considered only when
            DEXA expressly authorizes it in writing, an applicable written agreement provides otherwise,
            or applicable law requires a different result.
          </p>
          <p>
            No hardware may be returned without prior written authorization from DEXA. Unauthorized
            returns may be refused. If DEXA authorizes a return in an exceptional circumstance, the
            return may be subject to conditions communicated in writing, including required packaging,
            accessories, condition requirements, return shipping, restocking, missing-item, damage, or
            other reasonable charges where permitted by law.
          </p>

          <h2>3. Damaged, Defective, or Incorrect Hardware</h2>
          <p>
            If hardware arrives damaged, appears defective, or is materially different from the approved
            order, the merchant should contact DEXA promptly at{" "}
            <a href="mailto:support@dexaposai.com">support@dexaposai.com</a>. DEXA may request
            photographs, serial numbers, packaging, diagnostic information, or other information needed
            to evaluate the issue.
          </p>
          <p>
            Depending on the circumstances, applicable warranty, and product, DEXA may provide
            troubleshooting, repair, replacement, exchange, return authorization, account credit, or
            another appropriate remedy. A hardware problem does not automatically entitle the merchant to
            a monetary refund.
          </p>

          <h2>4. Software and Subscription Services</h2>
          <p>
            Software subscription and recurring service fees are generally non-refundable once the
            applicable billing period has begun or the service has been activated, except where required
            by applicable law or expressly agreed to in writing by DEXA. Cancellation stops future
            billing in accordance with the applicable cancellation terms but does not automatically
            entitle the merchant to a prorated refund or credit for amounts already paid.
          </p>

          <h2>5. Installation, Onboarding, Configuration, and Professional Services</h2>
          <p>
            Fees for services that have already been performed or substantially completed are
            non-refundable unless DEXA expressly agrees otherwise or applicable law requires a different
            result. These services may include installation, onboarding, menu setup, data entry,
            programming, configuration, training, migration assistance, or other professional services.
          </p>

          <h2>6. Exceptional Circumstances</h2>
          <p>
            DEXA may review unusual circumstances on a case-by-case basis. At DEXA&apos;s discretion and
            subject to applicable law, DEXA may approve a refund, return, exchange, replacement, or
            account credit. An exception in one instance does not change this Policy or create a right to
            the same exception in another instance.
          </p>

          <h2>7. Third-Party Charges</h2>
          <p>
            Charges imposed directly by independent third parties are subject to the applicable third
            party&apos;s terms. DEXA cannot guarantee refunds of processor fees, telecommunications
            charges, delivery-platform fees, third-party subscriptions, carrier charges, or other
            amounts collected directly by another provider.
          </p>

          <h2>8. Shipping and Order Processing</h2>
          <p>
            Physical product orders are processed based on availability, order approval, payment status,
            configuration or programming requirements, and other order conditions. Some equipment may
            require preparation before shipment. Any shipping or delivery date provided by DEXA is an
            estimate unless DEXA expressly guarantees a date in writing.
          </p>

          <h2>9. Shipping Charges</h2>
          <p>
            Shipping charges, if any, will be stated in the applicable quote, invoice, or order
            documentation or otherwise communicated before fulfillment. Expedited shipping may be
            available when offered and may involve additional charges.
          </p>

          <h2>10. Delivery</h2>
          <p>
            Products will be shipped to the address provided by the merchant. The merchant is responsible
            for providing complete and accurate shipping information and for ensuring that the delivery
            location can securely receive the shipment. DEXA is not responsible for delay, misdelivery,
            or loss caused by inaccurate or incomplete information supplied by the merchant.
          </p>

          <h2>11. Tracking and Delivery Delays</h2>
          <p>
            Tracking information may be provided when available. Delivery may be affected by carrier
            delays, weather, holidays, manufacturer or supply issues, transportation interruptions,
            governmental action, natural disasters, or other circumstances outside DEXA&apos;s reasonable
            control. DEXA does not guarantee carrier performance or delivery timing unless expressly
            agreed in writing.
          </p>

          <h2>12. Lost, Missing, or Damaged Shipments</h2>
          <p>
            Merchants should notify DEXA promptly if a shipment appears lost, arrives visibly damaged,
            contains incorrect equipment, or is missing items. DEXA may require documentation necessary
            to investigate with the carrier, supplier, or manufacturer. Any remedy will depend on the
            circumstances, applicable carrier or supplier rules, and any written agreement or warranty.
          </p>

          <h2>13. International Shipping</h2>
          <p>
            International shipping, if offered, may be subject to customs requirements, import
            restrictions, duties, taxes, brokerage charges, and local regulations. Unless DEXA expressly
            agrees otherwise in writing, the recipient is responsible for applicable import duties, taxes,
            customs charges, and regulatory requirements.
          </p>

          <div className="legal-contact">
            <h2>Contact</h2>
            <p>DEXA POS AI LLC</p>
            <p>
              Email: <a href="mailto:support@dexaposai.com">support@dexaposai.com</a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
