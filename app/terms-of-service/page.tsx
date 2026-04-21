import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service | AMFGI ERP',
  description: 'Public terms of service for Almuraqib Fiber Glass Industry ERP services.',
};

export default function TermsOfServicePage() {
  return (
    <LegalPage
      eyebrow="Public Legal Page"
      title="Terms of Service"
      updatedOn="April 20, 2026"
      summary="These Terms of Service govern access to and use of the AMFGI ERP platform and related services provided by Almuraqib Fiber Glass Industry LLC."
      sections={[
        {
          heading: 'Acceptance of Terms',
          body: [
            'By accessing or using the AMFGI ERP platform, you agree to these Terms of Service and any applicable policies referenced by them. If you do not agree, you should not use the service.',
          ],
        },
        {
          heading: 'Permitted Use',
          body: [
            'The platform is provided for lawful business use related to company operations such as workforce planning, inventory management, dispatch, and document generation.',
            'Users must not misuse the service, attempt unauthorized access, interfere with system operation, or use the platform in violation of applicable laws or contractual obligations.',
          ],
        },
        {
          heading: 'Accounts and Access',
          body: [
            'Users are responsible for maintaining the confidentiality of their account credentials and for all activity that occurs under their authorized access.',
            'Access may be suspended or revoked if we believe an account is being misused, compromised, or used in a way that threatens the platform or other users.',
          ],
        },
        {
          heading: 'Customer Data',
          body: [
            'Business data entered into the platform remains the responsibility of the customer or organization that submits it. Users must ensure they have the right to upload, store, and process that data.',
            'We may process customer data only to provide, secure, support, and improve the service, subject to applicable law and our Privacy Policy.',
          ],
        },
        {
          heading: 'Availability and Changes',
          body: [
            'We may update, improve, modify, suspend, or discontinue parts of the platform from time to time. We aim to keep the service available, but uninterrupted or error-free operation is not guaranteed.',
          ],
        },
        {
          heading: 'Limitation of Liability',
          body: [
            'To the maximum extent permitted by law, Almuraqib Fiber Glass Industry LLC is not liable for indirect, incidental, special, consequential, or punitive damages arising from use of the platform.',
            'The service is provided on an as-available basis, subject to the warranties and rights that cannot be excluded under applicable law.',
          ],
        },
        {
          heading: 'Contact',
          body: [
            'For questions about these Terms of Service, please contact Almuraqib Fiber Glass Industry LLC at info@almuraqib.ae.',
          ],
        },
      ]}
    />
  );
}
