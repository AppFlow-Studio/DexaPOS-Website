import type { Metadata } from "next";
import "../legal.css";

const EFFECTIVE_DATE = "September 11, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "DEXA POS AI LLC Terms of Service governing access to and use of DEXA products, software, hardware, support, and related services, including SMS and email communications.",
  openGraph: { title: "Terms of Service", url: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow">Legal</div>
          <h1>Terms of Service</h1>
          <p className="lede">
            DEXA POS AI LLC — Terms of Service. These Terms govern access to and use of
            DEXA products, software, hardware, support, and related services.
          </p>
        </div>
      </section>

      <section className="legal">
        <div className="wrap">
          <div className="legal-meta">Effective Date: {EFFECTIVE_DATE}</div>

          <p className="legal-intro">
            These Terms of Service (&quot;Terms&quot;) govern access to and use of products,
            software, hardware, websites, applications, support, and related services provided by
            DEXA POS AI LLC (&quot;DEXA,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
            These Terms are intended for use with merchants throughout the United States. By
            purchasing, accessing, or using DEXA products or services, you agree to these Terms. If
            you accept these Terms on behalf of a business, you represent that you have authority to
            bind that business.
          </p>

          <h2>1. Scope and Order Documents</h2>
          <p>
            These Terms are intended to apply generally to DEXA services. A quote, order form,
            invoice, service agreement, merchant processing agreement, hardware warranty, or other
            written agreement may contain additional or different terms. If there is a conflict, the
            more specific written agreement will control to the extent stated in that agreement and
            permitted by law.
          </p>

          <h2>2. DEXA Services</h2>
          <p>
            DEXA provides point-of-sale software, compatible hardware solutions, and related business
            technology services primarily for restaurant and hospitality operations. Depending on the
            products, services, configuration, and integrations selected, DEXA may support functions
            such as:
          </p>
          <ul>
            <li>Point-of-sale and order management</li>
            <li>Payment-related integrations and terminal connectivity</li>
            <li>Kitchen display and order routing</li>
            <li>Menu, inventory, staff, and operational management</li>
            <li>Reporting and analytics</li>
            <li>Online ordering, loyalty, and customer engagement</li>
            <li>SMS or email communications where supported and enabled</li>
            <li>Third-party integrations, onboarding, and technical support</li>
          </ul>
          <p>
            Not every feature is available to every merchant. Functionality may depend on the
            merchant account, subscription, hardware, processor, location, third-party services,
            network environment, and other configuration requirements. DEXA may add, modify, replace,
            or discontinue individual features from time to time. Services may also vary by
            jurisdiction and are subject to applicable federal, state, and local law.
          </p>

          <h2>3. Orders, Pricing, and Billing</h2>
          <p>
            Pricing for hardware, software, subscriptions, optional services, shipping, installation,
            configuration, or other charges will be stated in the applicable quote, order form,
            invoice, or other written documentation. Merchants are responsible for reviewing and
            approving applicable pricing before purchase. Taxes and third-party fees may apply where
            applicable.
          </p>
          <p>
            Certain DEXA services may be billed on a recurring basis. Billing frequency, cancellation
            requirements, minimum commitments, if any, and other subscription terms will be stated in
            the applicable order documentation or account terms. The merchant is responsible for
            maintaining a valid payment method. DEXA may suspend paid services for overdue or declined
            amounts where permitted by the applicable agreement and law.
          </p>

          <h2>4. Merchant Responsibilities</h2>
          <p>
            Merchants are responsible for their own business operations and for using DEXA in
            compliance with applicable law. Merchant responsibilities include:
          </p>
          <ul>
            <li>Providing accurate account, business, billing, and contact information</li>
            <li>Protecting usernames, passwords, PINs, and administrative credentials</li>
            <li>Limiting access to authorized personnel and managing user permissions</li>
            <li>Maintaining suitable internet, network, electrical, and operating conditions</li>
            <li>Reviewing and approving menu, pricing, tax, fee, discount, and operational settings</li>
            <li>Reviewing transactions, settlements, reports, and account activity</li>
            <li>Maintaining legally required customer notices, disclosures, consents, and policies</li>
            <li>Supervising employees and other authorized users of the system</li>
          </ul>

          <h2>5. Payment Processing</h2>
          <p>
            DEXA may connect with third-party payment processors, acquiring institutions, gateways,
            payment terminals, or related providers. Payment processing may be subject to separate
            agreements. Processing rates, transaction fees, chargebacks, funding, reserves,
            card-network rules, PCI obligations, underwriting, and related matters are governed by the
            applicable processor or financial institution unless DEXA expressly agrees otherwise in
            writing.
          </p>
          <p>
            DEXA does not guarantee processor approval, transaction authorization, funding
            availability, settlement timing, or uninterrupted operation of third-party payment
            services.
          </p>

          <h2>6. Third-Party Services and Integrations</h2>
          <p>
            DEXA may connect with or make available third-party products and services, such as payment
            processing, delivery, accounting, loyalty, messaging, hardware, telecommunications, or
            other technology services. Third parties may impose their own terms, fees, privacy
            practices, eligibility requirements, and service limitations. DEXA is not responsible for
            acts, omissions, outages, changes, or failures caused solely by an independent third party
            outside DEXA&apos;s reasonable control.
          </p>

          <h2>7. SMS and Email Communications</h2>
          <p>
            Certain DEXA services or supported integrations may support SMS, email, or similar
            electronic communications. Availability and functionality vary by subscription,
            configuration, integration, location, and third-party provider. Nothing in these Terms
            guarantees a particular messaging feature, delivery rate, audience size, automation,
            campaign type, or third-party messaging service.
          </p>

          <h3>7.1 Communications from DEXA to Merchants</h3>
          <p>
            DEXA may use contact information provided by merchants and their authorized representatives
            to send communications about accounts, billing, security, support, service updates,
            product information, educational content, promotions, offers, and other business-related
            communications. Where required by applicable law, DEXA will obtain any required consent or
            provide any required notice before sending marketing communications. Recipients may opt out
            of promotional email or SMS communications using the unsubscribe or opt-out method
            provided. Opting out of promotional communications will not prevent DEXA from sending
            non-promotional account, billing, security, transactional, legal, or support
            communications reasonably necessary to provide or administer the services.
          </p>

          <h3>7.2 Merchant Communications to Customers</h3>
          <p>
            Where supported and enabled, merchants may use DEXA services or supported third-party
            integrations to communicate with their own customers by SMS, email, or similar electronic
            channels. The merchant controls and is responsible for the content, recipients, timing,
            purpose, and legality of communications it initiates. Merchants must comply with applicable
            marketing, telecommunications, privacy, and consumer-protection laws and with applicable
            carrier, email-provider, and third-party platform rules.
          </p>

          <h3>7.3 Consent, Identification, and Opt-Outs</h3>
          <p>
            Where consent, notice, or another lawful basis is required, the merchant is responsible for
            obtaining and maintaining it before sending communications. Merchants must accurately
            identify themselves where required, provide legally required disclosures, honor applicable
            unsubscribe and opt-out requests, and use customer contact information only as permitted by
            applicable federal, state, and local law. Purchasing goods or services from a merchant does
            not, by itself, authorize every form of promotional communication.
          </p>

          <h3>7.4 SMS</h3>
          <p>
            For marketing text messages, merchants must comply with applicable federal and state
            requirements concerning consent, sender identification, message content, frequency,
            time-of-day restrictions, do-not-contact requests, and opt-outs. Where supported and
            legally applicable, recognized opt-out requests such as STOP should be honored. Merchants
            are responsible for determining which rules apply to their campaigns and recipients.
          </p>

          <h3>7.5 Email</h3>
          <p>
            Commercial email must comply with applicable federal and state requirements regarding
            sender information, subject lines, advertising disclosures, valid postal address
            information where required, and unsubscribe mechanisms. Merchants must promptly honor valid
            unsubscribe requests and may not use deceptive sender information, misleading subject lines,
            unlawfully obtained contact lists, or mechanisms designed to evade opt-out requirements.
          </p>

          <h3>7.6 Transactional and Service Communications</h3>
          <p>
            Some messages may be transactional, operational, account-related, or service-related rather
            than promotional, such as receipts, order notifications, security notices, support
            messages, or account updates. The legal treatment of a message depends on its content and
            applicable law. Merchants are responsible for ensuring that promotional content is not
            added in a manner that changes the nature of a communication without any required consent
            or disclosures.
          </p>

          <h3>7.7 Messaging Providers and Delivery</h3>
          <p>
            Messaging may rely on independent carriers, email providers, telecommunications providers,
            or other vendors. Delivery is not guaranteed. Messages may be delayed, filtered, blocked,
            rejected, or affected by provider rules, recipient devices, network conditions, spam
            controls, or legal requirements. DEXA may limit or suspend messaging activity that
            reasonably appears unlawful, fraudulent, abusive, deceptive, unauthorized, or harmful to
            DEXA, a merchant, a recipient, or a communications provider.
          </p>

          <h2>8. Acceptable Use</h2>
          <p>
            You may not use DEXA products or services to violate law, commit fraud, infringe
            intellectual-property rights, distribute malicious code, gain unauthorized access,
            circumvent security controls, interfere with system operation, send unlawful or deceptive
            communications, or use another person&apos;s data without authorization. DEXA may restrict
            or suspend use where reasonably necessary to protect the service, users, third parties, or
            legal compliance.
          </p>

          <h2>9. Software License and Intellectual Property</h2>
          <p>
            DEXA and its licensors retain ownership of DEXA software, documentation, trademarks,
            interfaces, designs, and related intellectual property. Subject to payment and compliance
            with applicable terms, DEXA grants the merchant a limited, non-exclusive, non-transferable
            right to use the applicable software for the merchant&apos;s internal business operations
            during the applicable service period. No ownership interest is transferred unless expressly
            stated in writing.
          </p>

          <h2>10. Merchant Data and Privacy</h2>
          <p>
            DEXA may process merchant, employee, customer, transaction, device, and related information
            as necessary to provide, support, secure, maintain, and improve the services; comply with
            law; and perform other activities described in the Privacy Policy or applicable agreements.
            Merchants remain responsible for their own customer-facing privacy disclosures and for
            obtaining consents required for their business practices.
          </p>

          <h2>11. Service Availability and Changes</h2>
          <p>
            DEXA uses commercially reasonable efforts to operate and support its services, but
            technology services may experience maintenance, interruptions, delays, errors,
            compatibility issues, or outages. Service availability may be affected by internet
            connections, power, hardware, processors, payment networks, third-party integrations,
            carriers, or other circumstances outside DEXA&apos;s reasonable control. DEXA does not
            guarantee uninterrupted or error-free service unless a separate written service-level
            commitment expressly states otherwise.
          </p>

          <h2>12. Suspension and Termination</h2>
          <p>
            DEXA may suspend or restrict access where reasonably necessary because of nonpayment,
            suspected fraud, security concerns, unlawful use, a material breach of applicable terms,
            third-party requirements, or legal obligations. When appropriate and legally permitted,
            DEXA may provide notice and an opportunity to address the issue.
          </p>

          <h2>13. Warranty Disclaimer</h2>
          <p>
            Except for warranties expressly provided in a written warranty or other agreement, and to
            the fullest extent permitted by law, DEXA products and services are provided on an
            &quot;as is&quot; and &quot;as available&quot; basis. DEXA disclaims implied warranties to
            the extent permitted by law, including merchantability, fitness for a particular purpose,
            and non-infringement. DEXA does not warrant that every service will be uninterrupted,
            error-free, compatible with every device or third-party service, or suitable for
            requirements not disclosed and agreed to in writing.
          </p>

          <h2>14. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, DEXA will not be liable for indirect, incidental,
            special, consequential, exemplary, or punitive damages, including lost profits, lost
            revenue, business interruption, loss of goodwill, or loss of data. Except where prohibited
            by law or otherwise stated in a signed agreement, DEXA&apos;s aggregate liability arising
            from the affected products or services will not exceed the amounts paid to DEXA for those
            affected products or services during the twelve months preceding the event giving rise to
            the claim. Nothing in these Terms limits liability that cannot legally be limited or
            excluded.
          </p>

          <h2>15. Indemnification</h2>
          <p>
            To the extent permitted by law, the merchant agrees to defend, indemnify, and hold harmless
            DEXA POS AI LLC and its officers, employees, affiliates, and service providers from
            third-party claims, losses, liabilities, damages, costs, and expenses arising from the
            merchant&apos;s unlawful use of the services, violation of these Terms, merchant
            communications or content, failure to obtain legally required consent, infringement of
            third-party rights, or the merchant&apos;s own products, services, employees, or business
            operations.
          </p>

          <h2>16. Force Majeure</h2>
          <p>
            DEXA is not responsible for delay or failure caused by circumstances outside its reasonable
            control, including natural disasters, severe weather, power or internet failures,
            telecommunications outages, labor disruptions, transportation problems, supply shortages,
            governmental actions, cyber incidents affecting third parties, or payment-network or
            third-party service interruptions.
          </p>

          <h2>17. Governing Law</h2>
          <p>
            These Terms are intended to apply throughout the United States. Unless a separate written
            agreement provides otherwise, these Terms are governed by the laws of the State of New York,
            without regard to conflict-of-law principles. This choice of law does not waive any rights,
            remedies, disclosures, venue protections, or other requirements that cannot lawfully be
            waived under applicable federal, state, or local law.
          </p>

          <h2>18. Changes to These Terms</h2>
          <p>
            DEXA may update these Terms from time to time. The current version will be posted with an
            updated effective date. Where required by law or an applicable agreement, DEXA will provide
            additional notice of material changes.
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
