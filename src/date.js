import { isBlank } from "./utils.js";

function parseByFormat(value, fmt) {
  const v = String(value ?? "").trim();

  if (!v) return null;

  if (fmt === "YYYY-MM-DD") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  return null;
}

function getZoneParts(date, timeZone, locale = "en-US") {
  const dtf = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function zonedMidnightToUtcMs({ year, month, day }, timeZone) {
  // Convert "YYYY-MM-DD midnight in timeZone" to UTC epoch ms
  // Approach: start with a UTC guess, then correct using formatted parts in tz (1-2 iterations).
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0);

  for (let i = 0; i < 2; i++) {
    const got = getZoneParts(new Date(guess), timeZone);

    // We want got = {year,month,day,00:00:00}
    // Compute how far off we are, in minutes.
    const gotAsUtc = Date.UTC(
      got.year,
      got.month - 1,
      got.day,
      got.hour,
      got.minute,
      got.second,
    );
    const wantAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);

    const diffMs = gotAsUtc - wantAsUtc;
    if (diffMs === 0) break;

    guess -= diffMs;
  }

  return guess;
}

function addDaysYMD({ year, month, day }, deltaDays) {
  // Use UTC to avoid local DST weirdness while adding days.
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function parseTargetWithOffset(target) {
  // supports: "today+7", "today-30", "end_date+7"
  const m = String(target)
    .trim()
    .match(/^(.+?)([+-]\d+)?$/);
  if (!m) return { base: String(target).trim(), offsetDays: 0 };
  return { base: m[1].trim(), offsetDays: m[2] ? Number(m[2]) : 0 };
}

function resolveYMDFromKeyword(keyword, timeZone) {
  const now = new Date();
  const { year, month, day } = getZoneParts(now, timeZone);
  if (keyword === "today") return { year, month, day };
  if (keyword === "tomorrow") return addDaysYMD({ year, month, day }, 1);
  if (keyword === "yesterday") return addDaysYMD({ year, month, day }, -1);
  return null;
}

function resolveYMD(target, formData, opts) {
  const { base, offsetDays } = parseTargetWithOffset(target);

  // 1) keyword
  let ymd = resolveYMDFromKeyword(base, opts.timezone);

  // 2) field reference
  if (!ymd) {
    const fieldVal = formData?.[base];
    ymd = parseStrictToYMD(fieldVal, opts);
  }

  // 3) literal date string (e.g. "2026-01-01") as a target
  if (!ymd) {
    ymd = parseByFormat(base, opts.dateFormat);
  }

  if (!ymd) return null;

  if (offsetDays) ymd = addDaysYMD(ymd, offsetDays);
  return ymd;
}

function isIsoLikeDateTimeString(s) {
  // Examples:
  // 2026-01-20T15:30:00Z
  // 2026-01-20T15:30:00.123Z
  // 2026-01-20T15:30:00-05:00
  // 2026-01-20 15:30:00Z (space tolerated if you want)
  return /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(
    s,
  );
}

function parseStrictToYMD(input, opts) {
  if (isBlank(input)) return null;

  const raw = String(input).trim();

  // 1) exact dateFormat
  let ymd = parseByFormat(raw, opts.dateFormat);
  if (ymd) return ymd;

  // 2) strict fallback: ISO-like datetime only
  if (!isIsoLikeDateTimeString(raw)) return null;

  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;

  const parts = getZoneParts(d, opts.timezone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function resolveDateEpochDay(valueOrTarget, formData, opts, mode) {
  // mode:
  // - "value": parse actual field value
  // - "target": resolve keyword/field/literal + offset
  let ymd = null;

  if (mode === "value") {
    ymd = parseStrictToYMD(valueOrTarget, opts);
  } else {
    ymd = resolveYMD(valueOrTarget, formData, opts);
  }

  if (!ymd) return null;
  return zonedMidnightToUtcMs(ymd, opts.timezone);
}
