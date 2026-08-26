'use strict';

function number(value) { return Number(String(value).replace(',', '.')); }

function unitInfo(rawUnit, amount) {
  const unit = String(rawUnit || '').toLowerCase();
  if (/^(kg|kilo|kilogramo)/.test(unit)) return { quantity: amount, unit: 'kg' };
  if (/^(g|gr|gramo)/.test(unit)) return { quantity: amount / 1000, unit: 'kg' };
  if (/^(l|lt|litro)/.test(unit)) return { quantity: amount, unit: 'l' };
  if (/^(ml|mililitro|cc)/.test(unit)) return { quantity: amount / 1000, unit: 'l' };
  return null;
}

function presentation(text, packagePrice) {
  const value = String(text || '').toLowerCase();
  const multipack = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?|g|gr|gramos?|l|lts?|litros?|ml|mililitros?|cc)\b/.exec(value)
    || /pack\s*(?:de\s*)?(\d+)[^\d]{0,12}(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?|g|gr|gramos?|l|lts?|litros?|ml|mililitros?|cc)\b/.exec(value);
  const mass = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?|g|gr|gramos?)\b/.exec(value);
  const volume = /(\d+(?:[.,]\d+)?)\s*(l|lts?|litros?|ml|mililitros?|cc)\b/.exec(value);
  const units = /(?:x|pack\s*(?:de)?)\s*(\d+)\b/.exec(value)
    || /(\d+)\s*(?:unidades?|uds?|un\.?|rollos?|sobres?|capsulas?|cápsulas?|pañales?)\b/.exec(value);
  let baseAmount = null; let comparisonUnit = null; let sizeLabel = '';
  let packageCount = 1; let itemQuantity = null;
  if (multipack) {
    const count = number(multipack[1]);
    const each = number(multipack[2]);
    const info = unitInfo(multipack[3], each);
    if (count > 0 && info) {
      baseAmount = count * info.quantity;
      comparisonUnit = info.unit;
      sizeLabel = `${count} x ${String(multipack[2]).replace('.', ',')} ${info.unit}`;
      packageCount = count;
      itemQuantity = info.quantity;
    }
  } else if (mass) {
    const amount = number(mass[1]);
    baseAmount = /^k/.test(mass[2]) ? amount : amount / 1000;
    comparisonUnit = 'kg'; sizeLabel = mass[0];
    itemQuantity = baseAmount;
  } else if (volume) {
    const amount = number(volume[1]);
    baseAmount = /^(l|lt)/.test(volume[2]) ? amount : amount / 1000;
    comparisonUnit = 'l'; sizeLabel = volume[0];
    itemQuantity = baseAmount;
  } else if (units) {
    baseAmount = number(units[1]); comparisonUnit = 'unidad'; sizeLabel = `x ${units[1]}`;
    packageCount = baseAmount; itemQuantity = 1;
  }
  const price = Number(packagePrice);
  return {
    sizeLabel,
    comparisonUnit,
    comparisonPrice: baseAmount > 0 && price > 0 ? +(price / baseAmount).toFixed(2) : null,
    packageQuantity: baseAmount,
    packageCount,
    itemQuantity,
  };
}

function samePresentation(expectedText, candidateText) {
  const expected = presentation(expectedText);
  if (!expected.packageQuantity || !expected.comparisonUnit) return null;
  const candidate = presentation(candidateText);
  if (!candidate.packageQuantity || candidate.comparisonUnit !== expected.comparisonUnit) return false;
  const tolerance = Math.max(0.01, expected.packageQuantity * 0.02);
  if (Math.abs(candidate.packageQuantity - expected.packageQuantity) > tolerance) return false;
  if (expected.packageCount !== candidate.packageCount) return false;
  return Math.abs(expected.itemQuantity - candidate.itemQuantity) <= Math.max(0.01, expected.itemQuantity * 0.02);
}

module.exports = { presentation, samePresentation };

