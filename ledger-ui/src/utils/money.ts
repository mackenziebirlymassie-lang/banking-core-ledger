import type { Direction } from '../types/ledger';

/**
 * Institutional money utilities adhering to zero floating-point math.
 * All calculations are executed strictly via BigInt integer minor units.
 */

export function formatMinor(minorInput: number | bigint | string, currency: string = 'USD'): string {
  const minor = BigInt(minorInput || 0);
  const isNegative = minor < 0n;
  const abs = isNegative ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');

  // Insert standard thousands commas
  const majorStr = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const symbol = getCurrencySymbol(currency);
  const formatted = `${symbol}${majorStr}.${cents}`;
  return isNegative ? `-${formatted}` : formatted;
}

export function parseToMinor(inputStr: string): number {
  if (!inputStr || !inputStr.trim()) {
    return 0;
  }
  // Remove currency symbols, commas, spaces
  const sanitized = inputStr.replace(/[^0-9.-]/g, '').trim();
  if (!sanitized) return 0;

  const isNeg = sanitized.startsWith('-');
  const unsigned = isNeg ? sanitized.slice(1) : sanitized;

  const parts = unsigned.split('.');
  const wholePart = parts[0] || '0';
  let decimalPart = parts[1] || '00';

  if (decimalPart.length === 1) {
    decimalPart += '0';
  } else if (decimalPart.length > 2) {
    decimalPart = decimalPart.slice(0, 2);
  }

  const minorBig = BigInt(wholePart) * 100n + BigInt(decimalPart);
  const signedBig = isNeg ? -minorBig : minorBig;
  return Number(signedBig);
}

export function getCurrencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'JPY':
      return '¥';
    case 'CHF':
      return 'CHF ';
    case 'CAD':
    case 'AUD':
      return 'A$';
    default:
      return `${currency} `;
  }
}

export function calculateLegsBalance(legs: { direction: Direction; amountMinor: number | bigint }[]): {
  totalDebitsMinor: bigint;
  totalCreditsMinor: bigint;
  diffMinor: bigint;
  isBalanced: boolean;
  totalDebitsFormatted: string;
  totalCreditsFormatted: string;
  diffFormatted: string;
} {
  let debits = 0n;
  let credits = 0n;

  for (const leg of legs) {
    const amt = BigInt(leg.amountMinor || 0);
    if (leg.direction === 'DEBIT') {
      debits += amt;
    } else {
      credits += amt;
    }
  }

  const diff = debits - credits;
  const isBalanced = diff === 0n;

  return {
    totalDebitsMinor: debits,
    totalCreditsMinor: credits,
    diffMinor: diff,
    isBalanced,
    totalDebitsFormatted: formatMinor(debits),
    totalCreditsFormatted: formatMinor(credits),
    diffFormatted: formatMinor(diff < 0n ? -diff : diff),
  };
}
