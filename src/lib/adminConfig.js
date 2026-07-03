export const ADMIN_EMAILS = [
  "TON_MAIL_ADMIN@exemple.com"
].map((email) => email.toLowerCase().trim());

export function isAdminUser(user) {
  const email = user?.email?.toLowerCase().trim();
  return Boolean(email && ADMIN_EMAILS.includes(email));
}

