import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

export function formatCurrency(n: number | null | undefined, decimals = 0): string {
  return `₹${formatNumber(n, decimals)}`;
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function parseSnapshotValue(value: string): { numeric: number | null; display: string } {
  const cleaned = value.replace(/[₹,\s%Cr.]/g, '');
  const num = parseFloat(cleaned);
  return {
    numeric: isNaN(num) ? null : num,
    display: value,
  };
}

export function getQuarterYear(period: string): number {
  const parts = period.split(' ');
  return parseInt(parts[parts.length - 1]);
}

const QUARTER_MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export function parsePeriodToDate(period: string): Date | null {
  const [month, yearText] = period.split(' ');
  const monthIndex = QUARTER_MONTH_MAP[month as keyof typeof QUARTER_MONTH_MAP];
  const year = Number(yearText);
  if (monthIndex === undefined || Number.isNaN(year)) return null;
  return new Date(year, monthIndex, 15);
}

export function subtractTimeframe(
  date: Date,
  value: number,
  unit: 'Years' | 'Months' | 'Days',
): Date {
  const result = new Date(date);
  if (unit === 'Years') result.setFullYear(result.getFullYear() - value);
  if (unit === 'Months') result.setMonth(result.getMonth() - value);
  if (unit === 'Days') result.setDate(result.getDate() - value);
  return result;
}

export function getChangeColor(change: number): string {
  return change >= 0 ? 'text-emerald-400' : 'text-rose-400';
}

export function getChangeBg(change: number): string {
  return change >= 0 ? 'bg-emerald-400/10' : 'bg-rose-400/10';
}
