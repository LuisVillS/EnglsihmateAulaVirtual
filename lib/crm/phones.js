const KNOWN_PHONE_COUNTRY_CODES = Object.freeze(
  [
    "998",
    "995",
    "994",
    "593",
    "592",
    "591",
    "598",
    "597",
    "596",
    "595",
    "594",
    "58",
    "57",
    "56",
    "55",
    "54",
    "53",
    "52",
    "51",
    "49",
    "48",
    "47",
    "46",
    "45",
    "44",
    "43",
    "41",
    "40",
    "39",
    "34",
    "33",
    "32",
    "31",
    "30",
    "27",
    "20",
    "7",
    "1",
  ].sort((left, right) => right.length - left.length || left.localeCompare(right))
);

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

export function normalizePhoneDigits(value) {
  const digits = value?.toString().replace(/\D/g, "");
  return digits || null;
}

export function normalizePhoneCountryCode(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits || digits.length < 1 || digits.length > 3) return null;
  return `+${digits}`;
}

function normalizeExplicitE164(value) {
  const raw = normalizeFreeText(value);
  if (!raw) return null;

  const digits = raw.startsWith("00")
    ? normalizePhoneDigits(raw.slice(2))
    : normalizePhoneDigits(raw);

  if (!digits || digits.length < 8 || digits.length > 15) return null;
  if (!(raw.startsWith("+") || raw.startsWith("00"))) return null;
  return `+${digits}`;
}

function inferCountryCodeFromInternationalDigits(digits) {
  if (!digits) return null;
  for (const countryCode of KNOWN_PHONE_COUNTRY_CODES) {
    if (digits.startsWith(countryCode)) {
      return `+${countryCode}`;
    }
  }
  return null;
}

function normalizeInternationalRawDigits(value) {
  const raw = normalizeFreeText(value);
  if (!raw) return null;
  if (raw.startsWith("+")) return normalizePhoneDigits(raw);
  if (raw.startsWith("00")) return normalizePhoneDigits(raw.slice(2));
  return null;
}

function isSimpleSequence(digits) {
  if (!digits || digits.length < 6) return false;
  const ascending = "0123456789012345";
  const descending = "98765432109876543210";
  return ascending.includes(digits) || descending.includes(digits);
}

function isRepeatedPattern(digits, size) {
  if (!digits || digits.length < size * 3 || digits.length % size !== 0) {
    return false;
  }

  const seed = digits.slice(0, size);
  return seed.repeat(digits.length / size) === digits;
}

export function looksFakePhoneDigits(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return true;
  if (digits.length < 6 || digits.length > 15) return true;
  if (/^(\d)\1+$/.test(digits)) return true;
  if (isSimpleSequence(digits)) return true;
  if (isRepeatedPattern(digits, 2)) return true;
  if (isRepeatedPattern(digits, 3)) return true;
  return false;
}

export function isPeruvianMobileNumber(value) {
  const digits = normalizePhoneDigits(value);
  return Boolean(digits && /^9\d{8}$/.test(digits));
}

export function normalizeCrmPhoneInput(
  {
    phone = null,
    phoneCountryCode = null,
    phoneNationalNumber = null,
    phoneE164 = null,
    defaultCountryCode = null,
  } = {}
) {
  const rawPhone = normalizeFreeText(phone);
  const explicitCountryCode =
    normalizePhoneCountryCode(phoneCountryCode) || normalizePhoneCountryCode(defaultCountryCode);
  const explicitNationalNumber = normalizePhoneDigits(phoneNationalNumber);
  const explicitE164 = normalizeExplicitE164(phoneE164);
  const rawInternationalDigits = normalizeInternationalRawDigits(rawPhone);
  const rawDigits = normalizePhoneDigits(rawPhone);

  let resolvedCountryCode = explicitCountryCode;
  let resolvedNationalNumber = explicitNationalNumber;
  let resolvedE164 = explicitE164;

  if (explicitE164) {
    const e164Digits = explicitE164.slice(1);
    const inferredCountryCode =
      normalizePhoneCountryCode(phoneCountryCode) || inferCountryCodeFromInternationalDigits(e164Digits);

    resolvedCountryCode = inferredCountryCode;
    if (inferredCountryCode) {
      const countryDigits = inferredCountryCode.slice(1);
      resolvedNationalNumber = e164Digits.startsWith(countryDigits)
        ? e164Digits.slice(countryDigits.length)
        : resolvedNationalNumber;
    }
  }

  if (!resolvedCountryCode && rawInternationalDigits) {
    resolvedCountryCode = inferCountryCodeFromInternationalDigits(rawInternationalDigits);
  }

  if (!resolvedNationalNumber) {
    if (rawInternationalDigits && resolvedCountryCode) {
      const countryDigits = resolvedCountryCode.slice(1);
      resolvedNationalNumber = rawInternationalDigits.startsWith(countryDigits)
        ? rawInternationalDigits.slice(countryDigits.length)
        : rawInternationalDigits;
    } else {
      resolvedNationalNumber = rawDigits;
    }
  }

  if (
    resolvedCountryCode &&
    resolvedNationalNumber &&
    rawInternationalDigits &&
    rawInternationalDigits === `${resolvedCountryCode.slice(1)}${resolvedNationalNumber}`
  ) {
    resolvedNationalNumber = rawInternationalDigits.slice(resolvedCountryCode.length - 1);
  }

  const validationErrors = [];

  if (resolvedCountryCode && !normalizePhoneCountryCode(resolvedCountryCode)) {
    validationErrors.push("Country code must be 1 to 3 digits.");
  }

  if (resolvedNationalNumber) {
    if (resolvedNationalNumber.length < 6 || resolvedNationalNumber.length > 12) {
      validationErrors.push("Phone number must be 6 to 12 digits without the country code.");
    }
    if (looksFakePhoneDigits(resolvedNationalNumber)) {
      validationErrors.push("Phone number looks invalid or obviously fake.");
    }
  }

  if (!resolvedNationalNumber && (rawPhone || resolvedCountryCode || explicitE164)) {
    validationErrors.push("A national phone number is required.");
  }

  if (resolvedCountryCode && resolvedNationalNumber) {
    const mergedDigits = `${resolvedCountryCode.slice(1)}${resolvedNationalNumber}`;
    if (mergedDigits.length < 8 || mergedDigits.length > 15) {
      validationErrors.push("Full phone number must be 8 to 15 digits in international format.");
    } else if (!looksFakePhoneDigits(mergedDigits)) {
      resolvedE164 = `+${mergedDigits}`;
    }
  } else if (!resolvedCountryCode) {
    resolvedE164 = null;
  }

  return {
    phone: rawPhone,
    phoneCountryCode: normalizePhoneCountryCode(resolvedCountryCode),
    phoneNationalNumber: normalizePhoneDigits(resolvedNationalNumber),
    phoneE164: normalizeExplicitE164(resolvedE164),
    isValid: validationErrors.length === 0 && Boolean(normalizePhoneDigits(resolvedNationalNumber)),
    validationErrors,
  };
}

export function validateCrmPhoneInput(
  input,
  { required = false, defaultCountryCode = null, requireCountryCode = true } = {}
) {
  const normalized = normalizeCrmPhoneInput({
    ...(input || {}),
    defaultCountryCode,
  });

  if (!required && !normalized.phone && !normalized.phoneNationalNumber && !normalized.phoneE164) {
    return {
      ...normalized,
      isValid: true,
      validationErrors: [],
    };
  }

  if (required && !normalized.phoneNationalNumber) {
    return {
      ...normalized,
      isValid: false,
      validationErrors: [...normalized.validationErrors, "Phone number is required."],
    };
  }

  if (requireCountryCode && normalized.phoneNationalNumber && !normalized.phoneCountryCode) {
    return {
      ...normalized,
      isValid: false,
      validationErrors: [...normalized.validationErrors, "Country code is required."],
    };
  }

  return normalized;
}

export function assertValidCrmPhoneInput(input, options = {}) {
  const validation = validateCrmPhoneInput(input, options);
  if (!validation.isValid) {
    throw new Error(validation.validationErrors[0] || "Invalid phone number.");
  }
  return validation;
}

export function getCanonicalCrmPhoneFields(record = {}) {
  return {
    phone: normalizeFreeText(record.phone),
    phoneCountryCode: normalizePhoneCountryCode(record.phoneCountryCode || record.phone_country_code),
    phoneNationalNumber: normalizePhoneDigits(
      record.phoneNationalNumber || record.phone_national_number
    ),
    phoneE164: normalizeExplicitE164(record.phoneE164 || record.phone_e164),
  };
}

export { KNOWN_PHONE_COUNTRY_CODES };
