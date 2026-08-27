export const LEGACY_HOUSEHOLD_ID = 'martin-lucia';

export const LEGACY_ACCOUNTS = Object.freeze({
  'martinmolina10101@gmail.com': 'u1',
  'luciia0295@gmail.com': 'u2',
  'brumitta1608@gmail.com': 'u2',
});

export function accountEmail(user) {
  return String(user?.email || '').trim().toLowerCase();
}

export function legacyProfileFor(user) {
  return LEGACY_ACCOUNTS[accountEmail(user)] || null;
}

export function cleanHouseholdText(value, fallback = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40) || fallback;
}

function cleanPhoto(value) {
  const photo = String(value || '').trim();
  if (/^https:\/\//i.test(photo) && photo.length <= 2000) return photo;
  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(photo) && photo.length <= 700000) return photo;
  return '';
}

export function householdDraft(values = {}, user = {}) {
  const myName = cleanHouseholdText(values.myName, cleanHouseholdText(user.name, 'Yo'));
  const partnerName = cleanHouseholdText(values.partnerName, 'Mi pareja');
  const childName = cleanHouseholdText(values.childName, 'Niños');
  const ideal = Number(values.expenseIdeal);
  const limit = Number(values.expenseLimit);
  const expenseBudget = ideal > 0 && limit > ideal ? { ideal, limit } : null;
  const cycleStartDay = Math.max(1, Math.min(28, Math.trunc(Number(values.cycleStartDay)) || 1));
  const priceArea = Number.isFinite(values.priceArea?.lat) && Number.isFinite(values.priceArea?.lon)
    ? {
      name: cleanHouseholdText(values.priceArea.name, 'tu zona'),
      lat: +Number(values.priceArea.lat).toFixed(3),
      lon: +Number(values.priceArea.lon).toFixed(3),
    } : null;
  return {
    name: cleanHouseholdText(values.name, `Hogar de ${myName}`),
    childName,
    childPhoto: cleanPhoto(values.childPhoto),
    expenseBudget,
    expenseSettings: { configured: true, cycleStartDay, cards: [] },
    priceArea,
    profiles: {
      owner: { name: myName, emoji: '👤', bg: '#dbe7ff', ...(cleanPhoto(values.myPhoto) ? { photo: cleanPhoto(values.myPhoto) } : {}) },
      partner: { name: partnerName, emoji: '👤', bg: '#ffe3dc', pending: true, ...(cleanPhoto(values.partnerPhoto) ? { photo: cleanPhoto(values.partnerPhoto) } : {}) },
    },
  };
}

export function cardsForHousehold(cards, home = {}) {
  const labels = home.cardLabels || {};
  return cards.map((card) => ({ ...card, label: cleanHouseholdText(labels[card.id], card.label) }));
}

export function inviteCodeFromLocation(locationLike) {
  try {
    return new URL(locationLike.href).searchParams.get('invite')?.trim() || '';
  } catch {
    return '';
  }
}
