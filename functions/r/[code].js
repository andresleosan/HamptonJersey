import { isPropertyQrCode, propertyQrListingUrl, recordPropertyQrRedirect, resolvePropertyQr } from '../../server/property-qr.js';

const headers = () => ({'cache-control':'no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex'});
const empty = status => new Response(null,{status,headers:headers()});

async function redirect(context,method) {
  // Disabled by default. This flag is not evidence that PUB-16, cache policy or privacy review are ready.
  if (context.env?.ANA10_PROPERTY_QR_READY !== '1' || !isPropertyQrCode(context.params?.code)) return empty(404);
  let association;
  try { association=await resolvePropertyQr(context.env.DB,context.params.code); }
  catch { return method==='HEAD' ? empty(503) : new Response('QR temporarily unavailable.',{status:503,headers:headers()}); }
  if (!association) return empty(404);
  if (method==='GET' && typeof context.waitUntil==='function') {
    try { context.waitUntil(recordPropertyQrRedirect(context.env.DB,association).catch(()=>{})); }
    catch { /* A measurement failure must not block the fixed redirect. */ }
  }
  return new Response(null,{status:302,headers:{...headers(),location:propertyQrListingUrl(association)}});
}
export const onRequestGet = context => redirect(context,'GET');
export const onRequestHead = context => redirect(context,'HEAD');
