/**
 * Currency Service
 * Handles currency conversions and exchange rate logic.
 * Base currency of the system for calculations and settlements is USD.
 */

// Hardcoded fallback exchange rates relative to USD (1 USD = rate in currency)
// For example: 1 USD = 83.0 INR => 1 INR = 1/83 USD
// 1 EUR = 1.08 USD => 1 USD = 0.925 EUR => rate = 0.925
const USD_EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  INR: 83.0,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.37,
  AUD: 1.51,
};

/**
 * Converts an amount from a target currency to USD.
 * @param amount Amount to convert
 * @param fromCurrency Currency code (e.g. USD, INR, EUR)
 * @returns Converted amount in USD
 */
export function convertToUSD(amount: number, fromCurrency: string): number {
  const currency = fromCurrency.toUpperCase();
  const rate = USD_EXCHANGE_RATES[currency];
  if (!rate) {
    throw new Error(`Unsupported currency: ${fromCurrency}`);
  }
  return amount / rate;
}

/**
 * Converts an amount from USD to a target currency.
 * @param amountUSD Amount in USD
 * @param toCurrency Target currency code (e.g. USD, INR, EUR)
 * @returns Converted amount in target currency
 */
export function convertFromUSD(amountUSD: number, toCurrency: string): number {
  const currency = toCurrency.toUpperCase();
  const rate = USD_EXCHANGE_RATES[currency];
  if (!rate) {
    throw new Error(`Unsupported currency: ${toCurrency}`);
  }
  return amountUSD * rate;
}

/**
 * Gets the exchange rate from one currency to another.
 * @param fromCurrency Source currency code
 * @param toCurrency Target currency code
 * @returns Exchange rate multiplier (amount * rate = converted amount)
 */
export function getExchangeRate(fromCurrency: string, toCurrency: string): number {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  
  const fromRate = USD_EXCHANGE_RATES[from];
  const toRate = USD_EXCHANGE_RATES[to];
  
  if (!fromRate) throw new Error(`Unsupported currency: ${fromCurrency}`);
  if (!toRate) throw new Error(`Unsupported currency: ${toCurrency}`);
  
  // Convert from -> USD -> to
  // amountInUSD = amount / fromRate
  // amountInTo = amountInUSD * toRate
  // So rate = toRate / fromRate
  return toRate / fromRate;
}

/**
 * Gets all supported currencies.
 */
export function getSupportedCurrencies(): string[] {
  return Object.keys(USD_EXCHANGE_RATES);
}
