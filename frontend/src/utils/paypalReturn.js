function searches(location) {
  const hash = String(location.hash || '');
  return [new URLSearchParams(location.search || ''),
    new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '')];
}
export function paypalSubscriptionReturn(location) {
  return searches(location).map(params => params.get('subscription_id')).find(Boolean) || null;
}
export function clearPaypalSubscriptionReturn(href) {
  const url = new URL(href);
  for (const key of ['subscription_id', 'ba_token', 'token']) url.searchParams.delete(key);
  if (url.hash.startsWith('#/')) {
    const hash = new URL(url.hash.slice(1), url.origin);
    for (const key of ['subscription_id', 'ba_token', 'token']) hash.searchParams.delete(key);
    url.hash = hash.pathname + hash.search;
  }
  return url.pathname + url.search + url.hash;
}
