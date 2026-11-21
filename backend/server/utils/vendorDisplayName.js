const upiPrefix = /^upi\s*\//i;
const direction = /^(?:dr|cr|p2p|p2m)$/i;
const reference = /^\d{6,}$/;
const paymentId = /^[^\s/@]+@[^\s/@]+$/;
const bank = /^(?:[a-z]{4}0[a-z\d]{6}|(?:axis|hdfc|icici|idbi|kotak|sbi|pnb|bob|union|canara|yes|indusind|idfc)(?:\s+bank)?|bank(?:\s+of\b.*)?|payment|transfer|upi|unknown|na|n\.a\.)$/i;

function upiName(label) {
  if (!upiPrefix.test(label)) return null;
  const parts = label.split('/').slice(1).map(part => part.trim());
  while (/^upi$/i.test(parts[0]) || direction.test(parts[0]) || parts[0] === '') parts.shift();
  if (reference.test(parts[0])) parts.shift();
  const candidate = parts[0] || '';
  return /\p{L}{2}/u.test(candidate) && !paymentId.test(candidate) && !bank.test(candidate)
    ? candidate
    : null;
}

function vendorDisplayName(recipient, savedLabel) {
  const original = recipient?.name?.trim() || recipient?.upiId?.trim() || '';
  const saved = savedLabel?.trim() || '';
  if (saved) {
    const cleaned = upiName(saved);
    if (cleaned) return cleaned;
    if (!upiPrefix.test(saved) && !paymentId.test(saved) && /\p{L}/u.test(saved)) return saved;
  }
  return upiName(original) || original || saved || 'Unknown';
}

function transactionCounterparty(tx) {
  const party = tx.type === 'INCOME' && (tx.sender?.name?.trim() || tx.sender?.upiId?.trim())
    ? tx.sender : tx.recipient;
  const name = vendorDisplayName(party, party === tx.recipient ? tx.recipientVendorRef?.label : undefined);
  return name === 'Unknown' ? tx.productName || tx.category || 'Transaction' : name;
}

module.exports = { vendorDisplayName, transactionCounterparty, paymentId };
