import { getVerificationBadgeConfig, AccountType } from '@/utils/verificationUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VerificationBadgeProps {
  accountType: AccountType;
  verified: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

export function VerificationBadge({
  accountType,
  verified,
  size = 'md',
  className = '',
  showTooltip = true,
}: VerificationBadgeProps) {
  if (!verified) {
    return null;
  }

  const config = getVerificationBadgeConfig(accountType);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const badge = (
    <div
      className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className}`}
      style={{
        background: `linear-gradient(135deg, ${config.colors.from}, ${config.colors.to})`,
        borderRadius: '50%',
        padding: '2px',
      }}
    >
      <Icon
        className="w-full h-full text-white"
        strokeWidth={2.5}
        fill="white"
      />
    </div>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <p className="font-semibold">{config.label}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
              {config.description}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

