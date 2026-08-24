/**
 * Format an amount as full currency (e.g., KSh 25,000)
 */
export const formatCurrencyFull = (amount: number | string): string => {
  const num = Number(amount);
  if (isNaN(num)) return 'KSh 0';
  return `KSh ${num.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
};

/**
 * Format an amount as compact currency (e.g., KSh 25K)
 */
export const formatCurrencyCompact = (amount: number | string): string => {
  const num = Number(amount);
  if (isNaN(num)) return 'KSh 0';
  
  if (num >= 1000000) {
    return `KSh ${(num / 1000000).toLocaleString('en-KE', { maximumFractionDigits: 1 })}M`;
  }
  if (num >= 1000) {
    return `KSh ${(num / 1000).toLocaleString('en-KE', { maximumFractionDigits: 1 })}K`;
  }
  
  return formatCurrencyFull(num);
};

/**
 * Format an amount in compact style without currency prefix (e.g., 25K)
 */
export const formatNumberCompact = (amount: number | string): string => {
  const num = Number(amount);
  if (isNaN(num)) return '0';
  
  if (num >= 1000000) {
    return `${(num / 1000000).toLocaleString('en-KE', { maximumFractionDigits: 1 })}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toLocaleString('en-KE', { maximumFractionDigits: 1 })}K`;
  }
  
  return num.toLocaleString('en-KE');
};
