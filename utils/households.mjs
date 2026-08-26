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

export function householdDraft(values = {}, user = {}) {
  const myName = cleanHouseholdText(values.myName, cleanHouseholdText(user.name, 'Yo'));
  const partnerName = cleanHouseholdText(values.partnerName, 'Mi pareja');
  const childName = cleanHouseholdText(values.childName, 'Niños');
  return {
    name: cleanHouseholdText(values.name, `Hogar de ${myName}`),
    childName,
    profiles: {
      owner: { name: myName, emoji: '👤', bg: '#dbe7ff' },
      partner: { name: partnerName, emoji: '👤', bg: '#ffe3dc', pending: true },
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
