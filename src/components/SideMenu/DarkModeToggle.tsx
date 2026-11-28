import { Moon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { setDarkMode, useIsDark } from '@/lib/theme';

/** Side menu row: the whole row toggles; the switch thumb slides. */
export function DarkModeToggle() {
  const isDark = useIsDark();
  return (
    <label className="side-menu__theme-row">
      <Moon size={24} strokeWidth={1.75} aria-hidden="true" className="side-menu__theme-icon" />
      <span className="side-menu__theme-label">Dark mode</span>
      <Switch
        checked={isDark}
        onCheckedChange={setDarkMode}
        aria-label="Dark mode"
        className="data-[state=checked]:bg-[var(--brand-pink-500)] data-[state=unchecked]:bg-[var(--neutral-200)] [&>span]:bg-[#FFFDFA]"
        style={{ borderRadius: 999 }}
      />
    </label>
  );
}
