import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | AMFGI ERP',
  description: 'Public privacy policy for Almuraqib Fiber Glass Industry ERP services.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Public Legal Page"
      title="Privacy Policy"
      updatedOn="April 20, 2026"
      summary="This Privacy Policy explains how Almuraqib Fiber Glass Industry LLC collects, uses, stores, and protects information when people use the AMFGI ERP platform and related business services."
      sections={[
        {
          heading: 'Information We Collect',
          body: [
            'We may collect account details, company details, employee records, attendance records, schedule data, job information, dispatch information, uploaded files, and communication details that are necessary to operate the AMFGI ERP platform.',
            'We may also collect limited technical information such as browser type, device information, IP address, and usage logs to keep the service secure and reliable.',
          ],
        },
        {
          heading: 'How We Use Information',
          body: [
            'We use collected information to provide ERP features, manage inventory and workforce operations, generate business documents, improve system performance, respond to support requests, and maintain service security.',
            'We do not sell personal information. Information is used only for legitimate business, operational, compliance, and support purposes related to the platform.',
          ],
        },
        {
          heading: 'Data Sharing',
          body: [
            'We may share information with authorized service providers that help us host, secure, maintain, or support the platform. Those providers may process data only as needed to deliver those services.',
            'We may disclose information when required by law, legal process, or to protect the rights, safety, and security of our business, customers, users, or the public.',
          ],
        },
        {
          heading: 'Data Storage and Security',
          body: [
            'We take reasonable administrative, technical, and organizational steps to protect information against unauthorized access, loss, misuse, alteration, or disclosure.',
            'No online system can guarantee absolute security, but we work to keep business data protected and access controlled.',
          ],
        },
        {
          heading: 'Retention',
          body: [
            'We retain information for as long as necessary to provide services, maintain business records, meet contractual obligations, resolve disputes, and comply with applicable legal requirements.',
          ],
        },
        {
          heading: 'Your Choices and Contact',
          body: [
            'If you need to request access, correction, or deletion of business account data, please contact us through the official company channels managing your AMFGI ERP access.',
            'For privacy-related inquiries, please contact Almuraqib Fiber Glass Industry LLC at info@almuraqib.ae.',
          ],
        },
      ]}
    />
  );
}
