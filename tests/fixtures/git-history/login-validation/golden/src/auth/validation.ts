export function isValidLoginEmail(email: string): boolean {
  const [, domain] = email.split("@");
  return domain !== undefined && domain.includes(".");
}
