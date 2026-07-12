'use client';
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      hideCloseButton
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center', padding: '8px 0' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 'var(--radius-lg)',
          background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(20,184,166,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: danger ? '#f87171' : 'var(--color-primary-400)',
        }}>
          <AlertTriangle size={24} />
        </div>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
        <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', lineHeight: 1.6 }}>{message}</p>
      </div>
    </Modal>
  );
}
