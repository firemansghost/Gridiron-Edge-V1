import React from 'react';

interface TeamLogoProps {
  teamName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TeamLogo({ 
  teamName, 
  logoUrl, 
  primaryColor = '#6B7280', 
  size = 'md',
  className = '' 
}: TeamLogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-lg'
  };

  const sizeClass = sizeClasses[size];

  // If we have a logo URL, try to use it
  if (logoUrl && logoUrl !== 'https://example.com/logos/team.png') {
    return (
      <img
        src={logoUrl}
        alt={`${teamName} logo`}
        className={`${sizeClass} rounded-full object-cover ${className}`}
        onError={(e) => {
          // If image fails to load, replace with fallback
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const fallback = target.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = 'flex';
        }}
      />
    );
  }

  // Fallback: colored circle with first letter
  const firstLetter = teamName.charAt(0).toUpperCase();
  const backgroundColor = primaryColor || '#6B7280';

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold ${className}`}
      style={{ backgroundColor }}
      title={teamName}
    >
      {firstLetter}
    </div>
  );
}
