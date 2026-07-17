// Per-type invested / current value estimates, shared by the investments
// summary route and the dashboard service.

function investedValue(d) {
  switch (d.investmentType) {
    case 'stock':
      return (d.buyPrice || 0) * (d.quantity || 0);
    case 'mf_sip':
      return d.totalInvested || d.sipAmount || 0;
    case 'fd':
      return d.principalAmount || 0;
    case 'real_estate':
      return d.totalInvested || d.purchaseValue || 0;
    default:
      return d.totalInvested || d.purchaseValue || 0;
  }
}

function currentValueOf(d) {
  switch (d.investmentType) {
    case 'stock':
      return (d.currentPrice || 0) * (d.quantity || 0);
    case 'mf_sip':
      return d.currentValue || (d.units || 0) * (d.nav || 0);
    case 'fd':
      return d.maturityAmount || d.principalAmount || 0;
    case 'real_estate':
      return d.currentValue || d.purchaseValue || 0;
    default:
      return d.currentValue || d.purchaseValue || 0;
  }
}

module.exports = { investedValue, currentValueOf };
