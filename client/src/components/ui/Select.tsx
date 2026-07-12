'use client';
import React, { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helper?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helper, placeholder, className = '', id, children, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="input-wrapper">
        {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
        <select
          ref={ref}
          id={inputId}
          className={`input ${error ? 'error' : ''} ${className}`.trim()}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {children}
        </select>
        {error && <p className="input-error">{error}</p>}
        {helper && !error && <p className="input-helper">{helper}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
