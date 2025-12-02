/**
 * Shared Labs Navigation Component
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function LabsNav() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Hybrid Model', href: '/labs/hybrid' },
    { label: 'Portal Continuity', href: '/labs/portal' },
    { label: 'Portfolio What-Ifs', href: '/labs/portfolio' },
  ];

  return (
    <div className="mb-6 border-b border-gray-200">
      <nav className="flex space-x-8">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm
                ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

