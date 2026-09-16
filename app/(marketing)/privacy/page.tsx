import type { Metadata } from "next";
import "../legal.css";

const EFFECTIVE_DATE = "September 11, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "DEXA POS AI LLC Privacy Policy explaining how DEXA collects, uses, discloses, retains, and protects personal information in connection with its websites, products, software, hardware, support, and related services.",
  openGraph: { title: "Privacy Policy", url: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow">Legal</div>
          <h1>Privacy Policy</h1>
          <p className="lede">
            DEXA POS AI LLC — Privacy Policy. How DEXA collects, uses, discloses, retains, and
            protects personal information in connection with its services.
          </p>
        </div>
      </section>

      <section className="legal">
        <div className="wrap">
          <div className="legal-meta">Effective Date: {EFFECTIVE_DATE}</div>

          <p className="legal-intro">
            This Privacy Policy explains, at a general level, how DEXA POS AI LLC (&quot;DEXA,&quot;
            &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) may collect, use, disclose, retain, and
            protect personal information in connection with DEXA websites, products, software,
            hardware, support, and related services. DEXA may serve merchants and users throughout the
            United States. Privacy rights and obligations may vary by jurisdiction and apply only to
            the extent required by applicable law.
          </p>

          <h2>1. Scope and Roles</h2>
          <p>
            DEXA may process information about merchants, merchant personnel, customers, website
            visitors, and other users. Depending on the context, DEXA may process information for its
            own legitimate business purposes or on behalf of a merchant that uses DEXA to operate its
            business. This Privacy Policy does not replace any privacy notice a merchant may be
            required to provide to its own customers, employees, or other individuals.
          </p>

          <h2>2. Information We May Collect</h2>

          <h3>Merchant and Account Information</h3>
          <p>
            We may collect business name, contact names, business and shipping addresses, email
            addresses, telephone numbers, billing information, account identifiers, subscription
            information, support records, and other information provided when a merchant creates or
            manages an account or purchases services.
          </p>

          <h3>Device and Technical Information</h3>
          <p>
            We may collect device type, software or application version, IP address, network
            information, device identifiers, system status, diagnostic information, error logs, security
            events, and similar technical information generated through use of the services.
          </p>

          <h3>Business and Transaction Information</h3>
          <p>
            Depending on the services used, DEXA may process information relating to menus or products,
            pricing, orders, transactions, inventory, business hours, staff, customer interactions,
            loyalty activity, reports, and analytics. The specific information processed varies by
            merchant configuration and enabled features.
          </p>

          <h3>Customer Information</h3>
          <p>
            Where a merchant uses customer-facing or customer-engagement features, DEXA may process
            information provided by the merchant or customer, such as a name, telephone number, email
            address, order history, loyalty information, preferences, receipt information, or
            communication preferences. DEXA does not require every merchant to collect all of these
            categories.
          </p>

          <h3>Website and Usage Information</h3>
          <p>
            When someone visits a DEXA website or online service, DEXA may collect information about
            browser or device type, pages viewed, referring pages, approximate location derived from IP
            address, and other usage information. DEXA may use cookies or similar technologies to
            operate the website, remember preferences, measure performance, understand usage, or support
            security. Available cookie controls may depend on the website and applicable law.
          </p>

          <h2>3. Sources of Information</h2>
          <p>
            DEXA may receive information directly from merchants, customers, website visitors, or
            merchant personnel; automatically from devices and services; or from third parties such as
            payment processors, integrations, service providers, or business partners where permitted by
            law and applicable agreements.
          </p>

          <h2>4. How We May Use Information</h2>
          <ul>
            <li>Create, maintain, authenticate, and administer accounts</li>
            <li>Provide, configure, operate, support, and improve DEXA products and services</li>
            <li>Process orders, billing, shipping, and merchant requests</li>
            <li>Facilitate payment-related and other merchant-selected integrations</li>
            <li>Provide reports, analytics, customer engagement, or communications where enabled</li>
            <li>Troubleshoot errors, monitor performance, and maintain service reliability</li>
            <li>Protect accounts, prevent fraud and abuse, and maintain security</li>
            <li>Communicate about accounts, services, support, security, and updates</li>
            <li>Comply with legal, regulatory, accounting, and recordkeeping obligations</li>
            <li>Exercise or defend legal rights and enforce applicable agreements</li>
          </ul>

          <h2>5. Merchant Customer Data</h2>
          <p>
            Merchants determine many of the purposes for which customer information is collected and
            used through their businesses. Merchants are responsible for providing notices, obtaining
            consents, and honoring customer choices required for their own activities. DEXA may process
            merchant customer data to provide and support the services selected by the merchant and as
            otherwise permitted by applicable agreements and law.
          </p>

          <h2>6. SMS and Email Communications</h2>
          <p>
            DEXA may use merchant and authorized-user contact information to communicate about accounts,
            billing, security, support, service updates, product information, educational content,
            promotions, offers, and other business-related matters. Where required by applicable law,
            DEXA will obtain any required consent for promotional communications and provide available
            unsubscribe or opt-out methods. Opting out of promotional communications does not prevent
            DEXA from sending non-promotional communications reasonably necessary to provide or
            administer services.
          </p>
          <p>
            Where messaging features are supported and enabled, customer contact information,
            communication preferences, and related records may be processed to facilitate SMS or email
            communications initiated by a merchant. Merchants are responsible for determining whether
            they have the notices, permissions, consents, or other lawful basis required for their
            communications and for honoring applicable customer choices and opt-out requests.
          </p>
          <p>
            SMS and email delivery may involve third-party telecommunications carriers, email providers,
            messaging platforms, or other service providers. Information may be shared with those
            providers as reasonably necessary to deliver or support the applicable communication
            service, subject to applicable agreements and law.
          </p>

          <h2>7. How We May Disclose Information</h2>
          <p>
            DEXA may disclose personal information as reasonably necessary to operate the services,
            including to service providers, processors, hosting or cloud providers, telecommunications
            and messaging providers, hardware or shipping providers, analytics providers, security and
            fraud-prevention providers, professional advisers, and merchant-selected integrations. These
            parties may process information under their own terms or on DEXA&apos;s or the
            merchant&apos;s behalf, depending on the service.
          </p>
          <p>
            DEXA may also disclose information when required by law or valid legal process, to protect
            rights or security, to investigate fraud or abuse, or in connection with a merger,
            acquisition, financing, restructuring, sale of assets, or similar business transaction.
          </p>
          <p>
            If DEXA engages in an activity that applicable privacy law defines as a &quot;sale,&quot;
            &quot;sharing,&quot; targeted advertising, or another regulated form of processing, DEXA
            will provide any notice, consent mechanism, opt-out right, or other choice required by
            applicable law. This statement does not mean that DEXA currently engages in every activity
            described by those legal terms.
          </p>

          <h2>8. Payment Information</h2>
          <p>
            Payment transactions may involve DEXA and one or more third-party processors, financial
            institutions, gateways, or payment providers. The information handled by each party depends
            on the merchant&apos;s processor and configuration. Third-party payment providers maintain
            their own terms, privacy practices, and security obligations.
          </p>

          <h2>9. Data Retention</h2>
          <p>
            DEXA may retain information for as long as reasonably necessary for the purposes described in
            this Policy, including providing services, maintaining business and financial records,
            supporting merchants, preventing fraud, maintaining security, resolving disputes, enforcing
            agreements, and complying with legal or regulatory obligations. Retention periods may vary by
            data type, service, contract, and legal requirement.
          </p>

          <h2>10. Data Security</h2>
          <p>
            DEXA uses reasonable administrative, technical, and organizational safeguards designed to
            protect information against unauthorized access, loss, misuse, alteration, or disclosure. No
            method of transmission, storage, or security can guarantee absolute protection.
          </p>

          <h2>11. U.S. State Privacy Rights and Choices</h2>
          <p>
            Depending on where you live and which laws apply to DEXA or the particular processing
            activity, you may have rights regarding personal information. These may include rights to
            request access to, correction or deletion of, or a copy of certain personal information, as
            well as rights to opt out of certain processing activities where applicable. Some
            jurisdictions may also provide a right to appeal certain privacy-request decisions. These
            rights are subject to applicable eligibility thresholds, verification requirements,
            exceptions, and limitations. DEXA will process verified privacy requests in accordance with
            applicable law. Requests may be submitted to{" "}
            <a href="mailto:support@dexaposai.com">support@dexaposai.com</a>. DEXA may take reasonable
            steps to verify your identity, residency, or authority to act on behalf of another person
            before processing a request.
          </p>

          <h2>12. Third-Party Sites and Integrations</h2>
          <p>
            DEXA services may link to or integrate with services operated by other companies. Those
            companies may process information under their own privacy policies. DEXA is not responsible
            for the independent privacy practices of third parties.
          </p>

          <h2>13. Changes to This Policy</h2>
          <p>
            DEXA may update this Privacy Policy from time to time to reflect changes in services,
            practices, or legal requirements. The current version will be posted with its effective
            date. Where required by law, DEXA will provide additional notice of material changes.
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
