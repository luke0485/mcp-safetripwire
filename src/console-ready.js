// Probe the local console without relying on a browser cookie jar.
export async function checkConsoleReady(address) {
  const url = new URL(address);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.username || url.password) {
    throw new Error('Invalid local console address');
  }
  const token = url.searchParams.get('token');
  if (!token || !/^[a-zA-Z0-9_-]+$/.test(token)) throw new Error('Missing console token');
  url.search = '';
  const response = await fetch(url, {
    headers: { 'x-tripwire-token': token },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  const html = await response.text();
  if (!response.ok || !/MCP (?:SafeTripwire|Tripwire)/.test(html)) throw new Error('界面服务未就绪');
  return true;
}
