const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LABEL_LENGTH = 63;
const LOCAL_SPECIAL_CHARACTERS = ".!#$%&'*+/=?^_`{|}~-";

function isAsciiLetterOrDigit(character) {
  const code = character.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isValidWorkspaceInviteEmail(value) {
  if (typeof value !== "string") return false;

  const email = value.trim();
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return false;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (!domain || localPart.length > MAX_LOCAL_PART_LENGTH) return false;
  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..")
  ) {
    return false;
  }

  for (const character of localPart) {
    if (!isAsciiLetterOrDigit(character) && !LOCAL_SPECIAL_CHARACTERS.includes(character)) {
      return false;
    }
  }

  const labels = domain.split(".");
  if (labels.length < 2) return false;

  return labels.every(label => {
    if (
      !label ||
      label.length > MAX_DOMAIN_LABEL_LENGTH ||
      label.startsWith("-") ||
      label.endsWith("-")
    ) {
      return false;
    }

    for (const character of label) {
      if (!isAsciiLetterOrDigit(character) && character !== "-") return false;
    }
    return true;
  });
}

module.exports = { isValidWorkspaceInviteEmail };
