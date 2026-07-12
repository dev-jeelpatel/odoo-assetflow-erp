'use client';
import React, { InputHTMLAttributes, forwardRef, TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, leftIcon, rightIcon, className = '', id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="input-wrapper">
        {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
        <div style={{ position: 'relative' }}>
          {leftIcon && (
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)', display: 'flex' }}>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`input ${error ? 'error' : ''} ${className}`.trim()}
            style={leftIcon ? { paddingLeft: 34 } : rightIcon ? { paddingRight: 34 } : undefined}
            {...rest}
          />
          {rightIcon && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)', display: 'flex' }}>
              {rightIcon}
            </span>
          )}
        </div>
        {error && <p className="input-error">{error}</p>}
        {helper && !error && <p className="input-helper">{helper}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helper, className = '', id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="input-wrapper">
        {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
        <textarea
          ref={ref}
          id={inputId}
          className={`input ${error ? 'error' : ''} ${className}`.trim()}
          style={{ resize: 'vertical', minHeight: 80 }}
          {...rest}
        />
        {error && <p className="input-error">{error}</p>}
        {helper && !error && <p className="input-helper">{helper}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
