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

function buildFlagIconClass(countryIso) {
  const normalizedIso = String(countryIso || "").trim().toLowerCase();
  return normalizedIso ? `flag-icon flag-icon-${normalizedIso}` : "";
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function normalizeRegionCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const localeMatch = raw.match(/[-_](\w{2})$/);
  if (!localeMatch?.[1]) return null;
  const countryCode = localeMatch[1].toUpperCase();
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
  const lockedCountryDialCode = lockedCountry?.dialCode || "";
  const selectedCountry =
    resolveCountryByAny(countryCode) ||
    lockedCountry ||
    resolveCountryByAny(preferredCountryCode) ||
    DEFAULT_PHONE_COUNTRY;

  useEffect(() => {
    if (!lockedCountryDialCode) return;
    if (countryCode === lockedCountryDialCode) return;
    onCountryCodeChange?.(lockedCountryDialCode);
  }, [countryCode, lockedCountryDialCode, onCountryCodeChange]);

  useEffect(() => {
    if (lockedCountryDialCode) return;
    if (countryCode) return;
    if (!selectedCountry?.dialCode) return;
    onCountryCodeChange?.(selectedCountry.dialCode);
  }, [countryCode, lockedCountryDialCode, onCountryCodeChange, selectedCountry?.dialCode]);

  const effectiveHelperText = useMemo(() => {
    if (helperText) return helperText;
    if (lockedCountryDialCode === DEFAULT_PHONE_COUNTRY.dialCode) {
      return "Solo se acepta un numero de Peru (+51).";
    }
    return "Separa el codigo de pais del numero.";
  }, [helperText, lockedCountryDialCode]);

  const countryFieldClass = compact || lockedCountry
    ? "grid-cols-[9.5rem_minmax(0,1fr)]"
    : "sm:grid-cols-[11rem_minmax(0,1fr)]";

  function renderCountrySummary(country) {
    if (!country) return null;

    return (
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={joinClasses(
            "h-5 w-6 shrink-0 rounded-[0.35rem] bg-center bg-cover shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]",
            buildFlagIconClass(country.iso)
          )}
        />
        <div className="min-w-0">
          <p className="text-[0.98rem] font-semibold tracking-[-0.02em] text-foreground">{country.dialCode}</p>
          {!compact ? <p className="truncate text-[11px] text-muted">{country.label}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label ? (
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </label>
      ) : null}

      <div className={joinClasses("grid gap-3", countryFieldClass)}>
        {lockedCountry ? (
          <div className="flex min-h-[3rem] items-center rounded-[1.25rem] border border-border bg-surface-2 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
            {renderCountrySummary(lockedCountry)}
          </div>
        ) : (
          <div className="relative min-h-[3rem] rounded-[1.25rem] border border-border bg-surface-2 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
            <div className="pointer-events-none flex h-full items-center justify-between gap-3">
              {renderCountrySummary(selectedCountry)}
              <span className="shrink-0 text-muted">
                <ChevronDownIcon />
              </span>
            </div>
            <select
              value={selectedCountry?.dialCode || DEFAULT_PHONE_COUNTRY.dialCode}
              onChange={(event) => onCountryCodeChange?.(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[1.25rem] opacity-0 outline-none"
              aria-label={`${label || "Phone"} country code`}
            >
              {PHONE_COUNTRIES.map((option) => {
                const optionLabel = showCountryName
                  ? `${option.label} (${option.dialCode})`
                  : option.dialCode;
                return (
                  <option key={option.iso} value={option.dialCode}>
                    {optionLabel}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div className="flex min-h-[3rem] items-center rounded-[1.25rem] border border-border bg-surface-2 px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
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
            className="w-full border-0 bg-transparent p-0 text-[1.08rem] font-medium tracking-[-0.02em] text-foreground outline-none placeholder:text-muted"
            aria-label={label || "Phone number"}
          />
        </div>
      </div>

      {effectiveHelperText ? <p className="text-xs text-muted">{effectiveHelperText}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
