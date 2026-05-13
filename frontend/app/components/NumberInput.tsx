'use client';

import React, { useState, useEffect } from 'react';

export interface NumberInputProps {
  mode?: 'spinner' | 'button';
  min?: number;
  max?: number;
  defaultValue?: number;
  value?: number | null;
  onChange?: (value: number | null) => void;
  placeholder?: string;
  variant?: 'outlined' | 'filled';
  style?: React.CSSProperties;
  className?: string;
  disabled?: boolean;
}

const baseInputStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  color: 'var(--text)',
  fontSize: '0.875rem',
  padding: '0.625rem 1rem',
  outline: 'none',
  transition: 'border-color 160ms, box-shadow 160ms',
  // Скрыть стандартные стрелки браузера
  MozAppearance: 'textfield' as any,
  WebkitAppearance: 'none' as any,
};

const filledInputStyle: React.CSSProperties = {
  ...baseInputStyle,
  background: 'var(--surface-3)',
};

const spinnerButtonStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--surface-2)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--border)',
  borderRadius: '0.5rem',
  color: 'var(--text)',
  fontSize: '1.25rem',
  cursor: 'pointer',
  transition: 'all 160ms',
  userSelect: 'none',
};

const spinnerButtonHoverStyle: React.CSSProperties = {
  background: 'var(--surface-3)',
  borderColor: 'var(--primary)',
};

export const NumberInput: React.FC<NumberInputProps> = ({
  mode = 'spinner',
  min,
  max,
  defaultValue,
  value: controlledValue,
  onChange,
  placeholder,
  variant = 'outlined',
  style,
  className,
  disabled = false,
}) => {
  const [internalValue, setInternalValue] = useState<number | null>(defaultValue ?? null);
  const [hoveredButton, setHoveredButton] = useState<'up' | 'down' | null>(null);

  // Скрыть стандартные стрелки браузера для input type="number"
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .gv-number-input-hide-spin::-webkit-outer-spin-button,
      .gv-number-input-hide-spin::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .gv-number-input-hide-spin {
        -moz-appearance: textfield;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleChange = (newValue: number | null) => {
    if (disabled) return;
    
    if (newValue !== null) {
      if (min !== undefined && newValue < min) newValue = min;
      if (max !== undefined && newValue > max) newValue = max;
    }

    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };

  const handleIncrement = () => {
    const currentValue = value ?? 0;
    const newValue = currentValue + 1;
    handleChange(newValue);
  };

  const handleDecrement = () => {
    const currentValue = value ?? 0;
    const newValue = currentValue - 1;
    handleChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === '') {
      handleChange(null);
      return;
    }

    const numValue = Number(inputValue);
    if (!isNaN(numValue)) {
      handleChange(numValue);
    }
  };

  const inputStyle = variant === 'filled' ? filledInputStyle : baseInputStyle;

  if (mode === 'spinner') {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: style?.width || 'auto',
        }}
      >
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || (min !== undefined && value !== null && value <= min)}
          style={{
            ...spinnerButtonStyle,
            ...(hoveredButton === 'down' && !disabled ? spinnerButtonHoverStyle : {}),
            opacity: disabled || (min !== undefined && value !== null && value <= min) ? 0.5 : 1,
            cursor: disabled || (min !== undefined && value !== null && value <= min) ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={() => setHoveredButton('down')}
          onMouseLeave={() => setHoveredButton(null)}
          tabIndex={-1}
        >
          -
        </button>
        
        <input
          type="number"
          value={value ?? ''}
          onChange={handleInputChange}
          placeholder={placeholder}
          min={min}
          max={max}
          disabled={disabled}
          style={{
            ...inputStyle,
            textAlign: 'center',
            ...style,
            width: style?.width || '80px',
          }}
          className={`gv-number-input-hide-spin ${className || ''}`}
        />

        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || (max !== undefined && value !== null && value >= max)}
          style={{
            ...spinnerButtonStyle,
            ...(hoveredButton === 'up' && !disabled ? spinnerButtonHoverStyle : {}),
            opacity: disabled || (max !== undefined && value !== null && value >= max) ? 0.5 : 1,
            cursor: disabled || (max !== undefined && value !== null && value >= max) ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={() => setHoveredButton('up')}
          onMouseLeave={() => setHoveredButton(null)}
          tabIndex={-1}
        >
          +
        </button>
      </div>
    );
  }

  // Button mode (default input)
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={handleInputChange}
      placeholder={placeholder}
      min={min}
      max={max}
      disabled={disabled}
      style={{
        ...inputStyle,
        ...style,
      }}
      className={`gv-number-input-hide-spin ${className || ''}`}
    />
  );
};

export default NumberInput;
