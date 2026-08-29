async function extractScreenshot(buffer, mimeType) {
  const hasKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY!=='your-gemini-api-key';
  if (!hasKey) throw new Error('GEMINI_API_KEY not configured');
  const prompt = `Extract UPI payment fields from this screenshot. Return ONLY JSON with keys: amount (number rupees), date (YYYY-MM-DD), time (HH:MM 24h), recipient (string), upiId (string), transactionId (string), utr (string). Use null for missing. No markdown.`;
  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ contents:[{ parts:[{ text: prompt }, { inline_data:{ mime_type: mimeType||'image/jpeg', data: buffer.toString('base64') } }]}], generationConfig:{ responseMimeType:'application/json' } }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p)=>p.text).join('')||'';
  let t = String(text).trim(); const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/); if(fence) t=fence[1];
  const parsed = JSON.parse(t.trim());
  let occurredAt = null;
  if (parsed.date) {
    const d = parsed.time ? `${parsed.date}T${parsed.time}:00` : `${parsed.date}T12:00:00`;
    const dt = new Date(d); if(!isNaN(dt.getTime())) occurredAt = dt;
  }
  return { amountPaise: parsed.amount!=null ? Math.round(Number(String(parsed.amount).replace(/[^0-9.-]/g,''))*100) : null, occurredAt, recipient: parsed.recipient?{ name: String(parsed.recipient), upiId: parsed.upiId?String(parsed.upiId):undefined }:undefined, upiId: parsed.upiId?String(parsed.upiId):undefined, transactionIdExt: parsed.transactionId?String(parsed.transactionId):undefined, utr: parsed.utr?String(parsed.utr):undefined, raw: parsed };
}

module.exports = { extractScreenshot };
