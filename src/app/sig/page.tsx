import type { Metadata } from 'next';
import { SigAssetsView } from '@/components/SigAssetsView';

export const metadata: Metadata = {
  title: 'Email Signature Assets — Julian Brunet',
  description:
    'Unlinked direct image reference page for email signature assets hosted on jbrunet.com.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function SigPage() {
  return <SigAssetsView />;
}
