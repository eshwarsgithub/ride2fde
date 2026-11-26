// Contact methods people can share. Used by the form (for quick feedback) and by the Pages Function,
// which is the authority: whatever it stores has gone through normalizeContact.

export type ContactType = "linkedin" | "email" | "whatsapp" | "phone";

export interface Contact {
  type: ContactType;
  value: string;
}

export const CONTACT_TYPES: ContactType[] = ["linkedin", "email", "whatsapp", "phone"];

export const CONTACT_LABEL: Record<ContactType, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  whatsapp: "WhatsApp",
  phone: "Phone / SMS",
};

export const CONTACT_PLACEHOLDER: Record<ContactType, string> = {
  linkedin: "linkedin.com/in/your-name",
  email: "name@example.com",
  whatsapp: "98765 43210",
  phone: "98765 43210",
};

const LINKEDIN_HANDLE = /^[A-Za-z0-9\-_%.]{3,100}$/;
const LINKEDIN_URL = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)/i;

/**
 * An Indian number: exactly 10 digits once spaces, dashes and a leading +91, 91 or 0 are taken off.
 * Stored with the country code ("91" + 10 digits) so wa.me and tel: links work.
 * WhatsApp needs a mobile number, and Indian mobiles start with 6, 7, 8 or 9. Phone / SMS also accepts a landline
 * with its area code (Hyderabad: 40 2345 6789), which never starts with 0 or 1.
 */
function normalizePhone(raw: string, mobileOnly: boolean): string | null {
  if (/[^\d\s()+.-]/.test(raw)) return null; // letters or other symbols: not a phone number
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  const valid = mobileOnly ? /^[6-9]\d{9}$/ : /^[2-9]\d{9}$/;
  return valid.test(digits) ? `91${digits}` : null;
}

function normalizeLinkedin(raw: string): string | null {
  const text = raw.trim();
  const fromUrl = text.match(LINKEDIN_URL)?.[1];
  const handle = fromUrl ?? (LINKEDIN_HANDLE.test(text) ? text : null);
  if (!handle || !LINKEDIN_HANDLE.test(handle)) return null;
  return `https://www.linkedin.com/in/${handle}`;
}

/** A plain address only. No `?`, `&` or `,`, so it can't smuggle extra recipients or headers into a mailto link. */
const EMAIL = /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;

function normalizeEmail(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  return text.length <= 254 && EMAIL.test(text) ? text : null;
}

/** Returns the cleaned contact, or null if the value isn't usable for that type. */
export function normalizeContact(type: unknown, raw: unknown): Contact | null {
  if (typeof raw !== "string" || !CONTACT_TYPES.includes(type as ContactType)) return null;
  const value =
    type === "linkedin" ? normalizeLinkedin(raw) : type === "email" ? normalizeEmail(raw) : normalizePhone(raw, type === "whatsapp");
  return value ? { type: type as ContactType, value } : null;
}

/** What to tell someone whose contact didn't pass, specific enough to fix it. */
function contactError(type: unknown): string {
  switch (type) {
    case "whatsapp":
      return "Enter a 10-digit WhatsApp mobile number, like 98765 43210.";
    case "phone":
      return "Enter a 10-digit phone number, like 98765 43210.";
    case "email":
      return "Enter an email address, like name@example.com.";
    case "linkedin":
      return "Enter your LinkedIn profile link, like linkedin.com/in/your-name.";
    default:
      return "Check the contact details.";
  }
}

/**
 * Validates a whole list: at most one entry per type, none invalid.
 * Empty values are skipped, so a blank row in the form is simply ignored.
 */
export function normalizeContacts(input: unknown): { contacts: Contact[]; error?: string } {
  if (input == null) return { contacts: [] };
  if (!Array.isArray(input) || input.length > CONTACT_TYPES.length) {
    return { contacts: [], error: "contacts must be a short list" };
  }
  const contacts: Contact[] = [];
  for (const item of input) {
    const { type, value } = (item ?? {}) as { type?: unknown; value?: unknown };
    if (typeof value === "string" && value.trim() === "") continue;
    const clean = normalizeContact(type, value);
    if (!clean) return { contacts: [], error: contactError(type) };
    if (contacts.some((c) => c.type === clean.type)) {
      return { contacts: [], error: `Use ${CONTACT_LABEL[clean.type]} only once` };
    }
    contacts.push(clean);
  }
  return { contacts };
}

export interface ContactAction {
  label: string;
  href: string;
}

/** The links a viewer can use for one contact. Rebuilt from the validated value, never trusted as-is. */
export function contactActions(contact: Contact): ContactAction[] {
  const clean = normalizeContact(contact.type, contact.value);
  if (!clean) return [];
  switch (clean.type) {
    case "linkedin":
      return [{ label: "LinkedIn", href: clean.value }];
    case "email":
      return [{ label: "Email", href: `mailto:${clean.value}` }];
    case "whatsapp":
      return [{ label: "WhatsApp", href: `https://wa.me/${clean.value}` }];
    case "phone":
      return [
        { label: "Call", href: `tel:+${clean.value}` },
        { label: "Text", href: `sms:+${clean.value}` },
      ];
  }
}
