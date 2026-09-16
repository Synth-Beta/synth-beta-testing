import React, { useState, useRef } from 'react';
import { Icon } from '@/components/Icon';
import './SearchBar.css';

export interface SearchBarProps {
  /**
   * Current search value (controlled component)
   */
  value?: string;
  
  /**
   * Callback when search value changes
   */
  onChange?: (value: string) => void;
  
  /**
   * Placeholder text
   * Default: "Search…"
   */
  placeholder?: string;
  
  /**
   * Callback when user submits search (Enter key)
   */
  onSubmit?: (value: string) => void;

  /**
   * Force the clear (X) button to show even when the field is empty.
   * Used for dismissible search overlays (e.g. Discover).
   */
  showClear?: boolean;

  /**
   * Called when the clear (X) button is pressed, after the value is cleared.
   * When provided, the input blurs instead of refocusing so the parent can dismiss search.
   */
  onClear?: () => void;
  
  /**
   * Width variant
   * - "full": device width - 40px (default)
   * - "popup": popup width - 40px
   * - "flex": flex-1, expands to fill available space (for Discover header)
   */
  widthVariant?: 'full' | 'popup' | 'flex';
  
  /**
   * Additional CSS classes
   */
  className?: string;
  
  /**
   * Auto-focus the input on mount
   */
  autoFocus?: boolean;
  
  /**
   * Disable the input
   */
  disabled?: boolean;
  
  /**
   * Input ID for accessibility
   */
  id?: string;
  
  /**
   * Input name attribute
   */
  name?: string;
  
  /**
   * Callback when input receives focus
   */
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  
  /**
   * Callback when input loses focus
   */
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;

  /**
   * Enable browser spellcheck. Default true. Set false for proper-noun search (artists, venues)
   * to avoid red underlines on names like "fred" or "Beyoncé".
   */
  spellCheck?: boolean;
}

/**
 * SearchBar Component
 * 
 * A reusable search input component matching Synth design specifications.
 * 
 * Features:
 * - Fixed 44px height
 * - 10px border radius
 * - Off-white background with 2px inside stroke light grey border
 * - Search icon on left (dark grey, 24px)
 * - Clear (X) icon on right when typing, or whenever showClear is set (off-black, 19px in 44x44 touch target, turns pink on hover)
 * - Placeholder: "Search…" (meta typography, dark grey)
 * - Text color: dark grey (placeholder) → off-black (typing)
 * 
 * Width Rules:
 * - "full": calc(100vw - 40px) - for default full-width search bars
 * - "popup": calc(popup width - 40px) - for search bars inside popups/modals
 * - "flex": flex-1 - for Discover header (expands leftward, stops at 20px margin)
 * 
 * Usage:
 *   <SearchBar onChange={(value) => setQuery(value)} />
 *   <SearchBar widthVariant="popup" placeholder="Search events..." />
 *   <SearchBar widthVariant="flex" onSubmit={handleSearch} />
 */
export const SearchBar: React.FC<SearchBarProps> = ({
  value: controlledValue,
  onChange,
  placeholder = 'Search…',
  onSubmit,
  widthVariant = 'full',
  className = '',
  autoFocus = false,
  disabled = false,
  id,
  name,
  onFocus,
  onBlur,
  spellCheck = true,
  showClear = false,
  onClear,
}) => {
  const [internalValue, setInternalValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Use controlled value if provided, otherwise use internal state
  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const isControlled = controlledValue !== undefined;
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (!isControlled) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };
  
  const handleClear = () => {
    if (!isControlled) {
      setInternalValue('');
    }
    onChange?.('');
    onClear?.();
    if (onClear) {
      inputRef.current?.blur();
    } else {
      inputRef.current?.focus();
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && onClear) {
      e.preventDefault();
      handleClear();
      return;
    }
    if (e.key === 'Enter' && onSubmit) {
      onSubmit(value);
    }
  };
  
  const hasValue = value.length > 0;
  const showClearButton = hasValue || showClear;
  
  // Build class names
  const baseClasses = 'synth-search-bar';
  const widthClass = `synth-search-bar--${widthVariant}`;
  const combinedClassName = [baseClasses, widthClass, className]
    .filter(Boolean)
    .join(' ');
  
  return (
    <div className={combinedClassName}>
      {/* Search icon (always visible on left) - ACCESSIBILITY: Decorative, hidden from screen readers */}
      <div className="synth-search-bar__icon-left" aria-hidden="true">
        <Icon name="search" size={24} alt="" />
      </div>
      
      {/* Input field - ACCESSIBILITY: Proper label association */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        spellCheck={spellCheck}
        id={id || `search-input-${Math.random().toString(36).substr(2, 9)}`}
        name={name}
        className="synth-search-bar__input"
        aria-label={placeholder || 'Search'}
        aria-describedby={showClearButton ? `${id || 'search-input'}-clear-button` : undefined}
      />
      
      {/* Clear (X) icon — when typing, or forced via showClear for dismissible overlays */}
      {showClearButton && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClear}
          className="synth-search-bar__clear"
          aria-label={hasValue ? 'Clear search' : 'Close search'}
          id={`${id || 'search-input'}-clear-button`}
        >
          <Icon name="x" size={19} alt="" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default SearchBar;

