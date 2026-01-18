"use strict";

export const redirect = (url) => (window.location.href = url);

export const isArray = (arr) => Array.isArray(arr);
export const isArrayEmpty = (arr) => !(Array.isArray(arr) && arr.length > 0);

export const isFocus = (element) => element == document.activeElement;

const currencyMap = {
  US: { locale: "en-US", currency: "USD" },
  CA: { locale: "en-CA", currency: "CAD" },
  FR: { locale: "fr-FR", currency: "EUR" },
  HT: { locale: "ht-HT", currency: "HTG" },
  GB: { locale: "en-GB", currency: "GBP" },
  AU: { locale: "en-AU", currency: "AUD" },
};

export const toCurrency = (
  value,
  { locale = "en-US", currency = "USD" } = {},
) =>
  Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
  }).format(value);

export const formatByCountry = (value, countryCode) => {
  const config = currencyMap[countryCode] ?? currencyMap["US"];
  return toCurrency(value, config);
};

export const isValidRoutingNumber = (routingNumber) => {
  if (!/^\d{9}$/.test(routingNumber)) {
    return false;
  }

  // Split the routing number into individual digits
  const digits = routingNumber.split("").map(Number);

  // Calculate the weighted sum
  const sum =
    7 * (digits[0] + digits[3] + digits[6]) +
    3 * (digits[1] + digits[4] + digits[7]) +
    1 * (digits[2] + digits[5] + digits[8]);

  // Check if the sum is a multiple of 10
  return sum % 10 === 0;
};
