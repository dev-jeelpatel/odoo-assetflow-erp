'use client';
import React from 'react';
import { prettyStatus, statusPill, rolePill, maintenancePill } from '@/lib/utils';

interface BadgeProps {
  status: string;
  type?: 'asset' | 'booking' | 'maintenance' | 'audit' | 'transfer' | 'role' | 'priority' | 'auto';
}

export function StatusPill({ status, type = 'auto' }: BadgeProps) {
  const s = status?.toUpperCase() ?? '';
  let cls = '';
  if (type === 'maintenance') cls = maintenancePill(s);
  else if (type === 'role') cls = rolePill(s);
  else cls = statusPill(s);

  return <span className={cls}>{prettyStatus(s)}</span>;
}

interface RoleBadgeProps { role: string; }
export function RoleBadge({ role }: RoleBadgeProps) {
  return <span className={rolePill(role)}>{prettyStatus(role)}</span>;
}

interface PriorityBadgeProps { priority: string; }
export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const map: Record<string, string> = {
    LOW: 'pill pill-low', MEDIUM: 'pill pill-medium',
    HIGH: 'pill pill-high', CRITICAL: 'pill pill-critical',
  };
  return <span className={map[priority?.toUpperCase()] ?? 'pill'}>{prettyStatus(priority)}</span>;
}
