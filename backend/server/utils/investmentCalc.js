// Per-type invested / current value estimates, shared by the investments
// summary route and the dashboard service.

function investedValue(d) {
  switch (d.investmentType) {
    case 'stock':
      return d.buyPrice != null && d.quantity != null ? d.buyPrice * d.quantity : (d.totalInvested ?? 0);
    case 'mf_sip':
      return d.totalInvested || d.sipAmount || 0;
    case 'fd':
      return d.principalAmount || 0;
    case 'real_estate':
      return d.purchaseValue ?? d.totalInvested ?? 0;
    default:
      return d.totalInvested || d.purchaseValue || 0;
  }
}

function currentValueOf(d) {
  switch (d.investmentType) {
    case 'stock':
      return d.currentPrice != null && d.quantity != null ? d.currentPrice * d.quantity : (d.currentValue ?? 0);
    case 'mf_sip':
      return d.currentValue || (d.units || 0) * (d.nav || 0);
    case 'fd':
      return d.maturityAmount || d.principalAmount || 0;
    case 'real_estate':
      return d.currentValue ?? d.purchaseValue ?? 0;
    default:
      return d.currentValue || d.purchaseValue || 0;
  }
}

module.exports = { investedValue, currentValueOf };
