export const getCurrencySymbol = (currencyCode) => {
  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const parts = formatter.formatToParts(0);
    const symbolPart = parts.find(part => part.type === 'currency');
    return symbolPart ? symbolPart.value : currencyCode;
  } catch (e) {
    console.warn(`Failed to get currency symbol for ${currencyCode}:`, e);
    return currencyCode;
  }
};

export const formatCurrency = (amount, currencyCode = 'USD') => {
  const n = Number(amount);
  if (isNaN(n)) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currencyCode}`;
  }
};
