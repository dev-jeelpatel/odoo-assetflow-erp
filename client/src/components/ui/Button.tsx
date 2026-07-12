'use client';
import React, { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, children, className = '', disabled, ...rest }, ref) => {
    const variantClass = `btn-${variant}`;
    const sizeClass = size === 'md' ? '' : `btn-${size}`;
    return (
      <button
        ref={ref}
        className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? (
          <span className="spinner" style={{ width: size === 'sm' ? 12 : 15, height: size === 'sm' ? 12 : 15 }} />
        ) : leftIcon}
        {children && <span>{children}</span>}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = 'Button';
