import React from 'react';

interface TeamLogoProps {
  teamName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  teamId?: string;
}

export function TeamLogo({ 
  teamName, 
  logoUrl, 
  primaryColor = '#6B7280', 
  size = 'md',
  className = '',
  teamId
}: TeamLogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-24 h-24 text-3xl'
  };

  const sizeClass = sizeClasses[size];

  // Try local logo first, then external URL, then fallback
  const localLogoPath = teamId ? `/logos/${teamId}.png` : null;
  const hasExternalLogo = logoUrl && logoUrl !== 'https://example.com/logos/team.png';

  if (localLogoPath || hasExternalLogo) {
    return (
      <div className="relative">
        {/* Try local logo first */}
        {localLogoPath && (
          <img
            src={localLogoPath}
            alt={`${teamName} logo`}
            className={`${sizeClass} rounded-full object-cover ${className}`}
            onError={(e) => {
              // If local logo fails, try external URL
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const externalImg = target.nextElementSibling as HTMLImageElement;
              if (externalImg && hasExternalLogo) {
                externalImg.style.display = 'block';
              } else {
                // If no external logo or it also fails, show fallback
                const fallback = target.parentElement?.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }
            }}
          />
        )}
        
        {/* External logo fallback */}
        {hasExternalLogo && (
          <img
            src={logoUrl}
            alt={`${teamName} logo`}
            className={`${sizeClass} rounded-full object-cover ${className}`}
            style={{ display: localLogoPath ? 'none' : 'block' }}
            onError={(e) => {
              // If external logo also fails, show fallback
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const fallback = target.parentElement?.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        )}
        
        {/* Fallback circle (hidden by default) */}
        <div
          className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold ${className}`}
          style={{ 
            backgroundColor: primaryColor || '#6B7280',
            display: 'none'
          }}
          title={teamName}
        >
          {teamName.charAt(0).toUpperCase()}
        </div>
      </div>
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
