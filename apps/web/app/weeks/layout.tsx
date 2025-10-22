import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

export default function WeeksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        {children}
      </div>
      <Footer />
    </div>
  );
}
