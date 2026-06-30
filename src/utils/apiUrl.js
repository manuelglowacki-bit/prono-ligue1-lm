export function getApiUrl(path = '') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  const envUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  const isBadLocalUrl =
    envUrl &&
    (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'));

  if (envUrl && !isBadLocalUrl) {
    return `${envUrl.replace(/\/$/, '')}${cleanPath}`;
  }

  return cleanPath;
}
