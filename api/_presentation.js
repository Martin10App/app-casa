'use strict';

function number(value) { return Number(String(value).replace(',', '.')); }

function presentation(text, packagePrice) {
  const value = String(text || '').toLowerCase();
  const mass = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|gramos?)\b/.exec(value);
  const volume = /(\d+(?:[.,]\d+)?)\s*(l|lts?|litros?|ml|cc)\b/.exec(value);
  const units = /(?:x|pack\s*(?:de)?)\s*(\d+)\b/.exec(value);
  let baseAmount = null; let comparisonUnit = null; let sizeLabel = '';
  if (mass) {
    const amount = number(mass[1]);
    baseAmount = /^k/.test(mass[2]) ? amount : amount / 1000;
    comparisonUnit = 'kg'; sizeLabel = mass[0];
  } else if (volume) {
    const amount = number(volume[1]);
    baseAmount = /^(l|lt)/.test(volume[2]) ? amount : amount / 1000;
    comparisonUnit = 'l'; sizeLabel = volume[0];
  } else if (units) {
    baseAmount = number(units[1]); comparisonUnit = 'unidad'; sizeLabel = `x ${units[1]}`;
  }
  const price = Number(packagePrice);
  return {
    sizeLabel,
    comparisonUnit,
    comparisonPrice: baseAmount > 0 && price > 0 ? +(price / baseAmount).toFixed(2) : null,
  };
}

module.exports = { presentation };

