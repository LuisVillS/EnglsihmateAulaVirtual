"use client";

import { useEffect, useMemo } from "react";
import {
  isPeruvianMobileNumber,
  validateCrmPhoneInput,
} from "@/lib/crm/phones";

const PHONE_COUNTRIES = Object.freeze([
  { iso: "PE", dialCode: "+51", label: "Peru", placeholder: "999888777" },
  { iso: "CO", dialCode: "+57", label: "Colombia", placeholder: "3001234567" },
  { iso: "CL", dialCode: "+56", label: "Chile", placeholder: "912345678" },
  { iso: "AR", dialCode: "+54", label: "Argentina", placeholder: "91123456789" },
  { iso: "EC", dialCode: "+593", label: "Ecuador", placeholder: "991234567" },
  { iso: "MX", dialCode: "+52", label: "Mexico", placeholder: "5512345678" },
  { iso: "US", dialCode: "+1", label: "United States", placeholder: "4155552671" },
  { iso: "ES", dialCode: "+34", label: "Spain", placeholder: "612345678" },
]);

const COUNTRY_BY_ISO = new Map(PHONE_COUNTRIES.map((country) => [country.iso, country]));
const COUNTRY_BY_DIAL = new Map(PHONE_COUNTRIES.map((country) => [country.dialCode, country]));

const REGION_TIME_ZONE_MAP = Object.freeze({
  "America/Argentina/Buenos_Aires": "AR",
  "America/Bogota": "CO",
  "America/Guayaquil": "EC",
  "America/Lima": "PE",
  "America/Los_Angeles": "US",
  "America/Mexico_City": "MX",
  "America/New_York": "US",
  "America/Santiago": "CL",
  "Europe/Madrid": "ES",
});

export const DEFAULT_PHONE_COUNTRY = COUNTRY_BY_ISO.get("PE");

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

function buildFlagEmoji(countryIso) {
  if (!countryIso || countryIso.length !== 2) return "";
  return countryIso
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function normalizeRegionCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const localeMatch = raw.match(/[-_](\w{2})$/);
  const countryCode = (localeMatch?.[1] || raw).toUpperCase();
  return COUNTRY_BY_ISO.get(countryCode)?.iso || null;
}

function resolveCountryByAny(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return COUNTRY_BY_DIAL.get(raw) || COUNTRY_BY_ISO.get(raw.toUpperCase()) || null;
}

function getNavigatorLocales() {
  if (typeof window === "undefined") return [];
  const languages = Array.isArray(window.navigator?.languages)
    ? window.navigator.languages
    : [];
  const single = window.navigator?.language ? [window.navigator.language] : [];
  const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale
    ? [Intl.DateTimeFormat().resolvedOptions().locale]
    : [];
  const documentLang =
    typeof document !== "undefined" && document.documentElement?.lang
      ? [document.documentElement.lang]
      : [];

  return [...languages, ...single, ...intlLocale, ...documentLang];
}

function getTimeZoneCountry() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return REGION_TIME_ZONE_MAP[timeZone] || null;
  } catch {
    return null;
  }
}

export function detectLikelyPhoneCountry({ preferredCountryCode = "" } = {}) {
  const explicit = resolveCountryByAny(preferredCountryCode);
  if (explicit) return explicit;

  for (const locale of getNavigatorLocales()) {
    const region = normalizeRegionCandidate(locale);
    if (region) {
      return COUNTRY_BY_ISO.get(region) || DEFAULT_PHONE_COUNTRY;
    }
  }

  const timeZoneRegion = getTimeZoneCountry();
  if (timeZoneRegion) {
    return COUNTRY_BY_ISO.get(timeZoneRegion) || DEFAULT_PHONE_COUNTRY;
  }

  return DEFAULT_PHONE_COUNTRY;
}

export function buildStructuredPayerPhone(countryCode, nationalNumber) {
  const validation = validateCrmPhoneInput(
    {
      phoneCountryCode: countryCode,
      phoneNationalNumber: nationalNumber,
    },
    {
      required: false,
      defaultCountryCode: DEFAULT_PHONE_COUNTRY.dialCode,
    }
  );

  return validation.phoneE164 || "";
}

export function splitStoredPayerPhone(value, fallbackCountryCode = DEFAULT_PHONE_COUNTRY.dialCode) {
  const validation = validateCrmPhoneInput(
    {
      phone: value,
      phoneE164: value,
    },
    {
      required: false,
      defaultCountryCode: fallbackCountryCode,
    }
  );

  return {
    dialCode: validation.phoneCountryCode || fallbackCountryCode,
    nationalNumber: validation.phoneNationalNumber || "",
    e164: validation.phoneE164 || "",
  };
}

export function validateStructuredPhone({
  countryCode,
  nationalNumber,
  required = false,
}) {
  const validation = validateCrmPhoneInput(
    {
      phoneCountryCode: countryCode,
      phoneNationalNumber: nationalNumber,
    },
    {
      required,
      defaultCountryCode: DEFAULT_PHONE_COUNTRY.dialCode,
    }
  );

  return validation.validationErrors[0] || "";
}

export function validatePeruvianPhone(nationalNumber, { required = false } = {}) {
  const digits = String(nationalNumber || "").replace(/\D/g, "");
  if (!digits) return required ? "Ingresa un numero peruano valido." : "";
  if (!isPeruvianMobileNumber(digits)) {
    return "Ingresa un celular peruano valido de 9 digitos.";
  }
  return "";
}

export default function PayerPhoneField({
  label,
  required = false,
  countryCode,
  nationalNumber,
  onCountryCodeChange,
  onNationalNumberChange,
  error = "",
  helperText = "",
  compact = false,
  showCountryName = true,
  lockedCountryCode = "",
  preferredCountryCode = "",
  inputMode = "tel",
  nationalPlaceholder = "",
}) {
  const lockedCountry = resolveCountryByAny(lockedCountryCode);
  const selectedCountry =
    resolveCountryByAny(countryCode) ||
    lockedCountry ||
    detectLikelyPhoneCountry({ preferredCountryCode });

  useEffect(() => {
    if (!lockedCountry?.dialCode) return;
    if (countryCode === lockedCountry.dialCode) return;
    onCountryCodeChange?.(lockedCountry.dialCode);
  }, [countryCode, lockedCountry?.dialCode, onCountryCodeChange]);

  const effectiveHelperText = useMemo(() => {
    if (helperText) return helperText;
    if (lockedCountry?.dialCode === DEFAULT_PHONE_COUNTRY.dialCode) {
      return "Solo se acepta un numero de Peru (+51).";
    }
    return "Separa el codigo de pais del numero.";
  }, [helperText, lockedCountry?.dialCode]);

  const countryFieldClass = compact || lockedCountry
    ? "sm:grid-cols-[6.5rem_minmax(0,1fr)]"
    : "sm:grid-cols-[11rem_minmax(0,1fr)]";

  return (
    <div className="space-y-2">
      {label ? (
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </label>
      ) : null}

      <div className={joinClasses("grid gap-3", countryFieldClass)}>
        {lockedCountry ? (
          <div className="flex min-h-[3rem] items-center justify-center rounded-2xl border border-border bg-surface-2 px-3 text-sm font-semibold text-foreground">
            <span aria-hidden="true">{buildFlagEmoji(lockedCountry.iso)}</span>
            <span className="ml-2">{lockedCountry.dialCode}</span>
          </div>
        ) : (
          <select
            value={selectedCountry?.dialCode || DEFAULT_PHONE_COUNTRY.dialCode}
            onChange={(event) => onCountryCodeChange?.(event.target.value)}
            className="min-h-[3rem] rounded-2xl border border-border bg-surface-2 px-3 text-sm text-foreground outline-none transition focus:border-primary"
            aria-label={`${label || "Phone"} country code`}
          >
            {PHONE_COUNTRIES.map((option) => {
              const optionLabel = showCountryName
                ? `${buildFlagEmoji(option.iso)} ${option.label} (${option.dialCode})`
                : `${buildFlagEmoji(option.iso)} ${option.dialCode}`;
              return (
                <option key={option.iso} value={option.dialCode}>
                  {optionLabel}
                </option>
              );
            })}
          </select>
        )}

        <input
          type="tel"
          required={required}
          value={nationalNumber}
          onChange={(event) =>
            onNationalNumberChange?.(event.target.value.replace(/[^\d]/g, "").slice(0, 15))
          }
          inputMode={inputMode}
          autoComplete="tel-national"
          placeholder={nationalPlaceholder || selectedCountry?.placeholder || "999888777"}
          className="min-h-[3rem] rounded-2xl border border-border bg-surface-2 px-4 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary"
          aria-label={label || "Phone number"}
        />
      </div>

      {effectiveHelperText ? <p className="text-xs text-muted">{effectiveHelperText}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
