export function getApiUrl(path = '') {
  const host = window.location.hostname || 'localhost';
  const cleanPath = String(path || '');

  return `http://${host}:4000${cleanPath}`;
}
