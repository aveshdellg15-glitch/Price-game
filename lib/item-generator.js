'use strict';

/**
 * Price Game — deterministic item generator.
 *
 * Exactly 1,000,000 addressable items (ids 1..1_000_000). Every item is
 * generated deterministically from its id, so the server can reproduce any
 * item's actual price without storing a million rows. Categories: houses,
 * celebrity outfits, cars, groceries and ridiculous items. Prices are scaled
 * to the match's chosen country/currency.
 */

const ITEM_COUNT = 1000000;

const CATEGORIES = [
  'houses',
  'celebrity_outfits',
  'cars',
  'groceries',
  'ridiculous'
];

const CATEGORY_LABELS = {
  houses: 'Real Estate',
  celebrity_outfits: 'Celebrity Outfit',
  cars: 'Cars',
  groceries: 'Groceries',
  ridiculous: 'Ridiculous Items'
};

const CATEGORY_ICONS = {
  houses: '🏠',
  celebrity_outfits: '👗',
  cars: '🚗',
  groceries: '🛒',
  ridiculous: '🤪'
};

const CATEGORY_GRADIENTS = {
  houses: 'linear-gradient(135deg, #0ea5e9 0%, #0891b2 100%)',
  celebrity_outfits: 'linear-gradient(135deg, #db2777 0%, #be185d 100%)',
  cars: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  groceries: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
  ridiculous: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)'
};

const COUNTRIES = [
  { code: 'US', name: 'United States', currency: 'USD', symbol: '$', multiplier: 1.00, fractionDigits: 2 },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', multiplier: 0.79, fractionDigits: 2 },
  { code: 'EU', name: 'Eurozone', currency: 'EUR', symbol: '€', multiplier: 0.93, fractionDigits: 2 },
  { code: 'JP', name: 'Japan', currency: 'JPY', symbol: '¥', multiplier: 143.00, fractionDigits: 0 },
  { code: 'CA', name: 'Canada', currency: 'CAD', symbol: 'CA$', multiplier: 1.36, fractionDigits: 2 },
  { code: 'AU', name: 'Australia', currency: 'AUD', symbol: 'AU$', multiplier: 1.52, fractionDigits: 2 },
  { code: 'IN', name: 'India', currency: 'INR', symbol: '₹', multiplier: 83.00, fractionDigits: 0 },
  { code: 'BR', name: 'Brazil', currency: 'BRL', symbol: 'R$', multiplier: 5.20, fractionDigits: 2 },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', symbol: 'R', multiplier: 18.20, fractionDigits: 2 },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', symbol: '₦', multiplier: 1520.00, fractionDigits: 0 },
  { code: 'KR', name: 'South Korea', currency: 'KRW', symbol: '₩', multiplier: 1375.00, fractionDigits: 0 },
  { code: 'MX', name: 'Mexico', currency: 'MXN', symbol: 'MX$', multiplier: 17.80, fractionDigits: 2 }
];

const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map(c => [c.code, c]));

const CITIES = {
  US: ['Los Angeles, CA', 'New York, NY', 'Miami, FL', 'Austin, TX', 'Malibu, CA', 'The Hamptons, NY', 'Aspen, CO', 'Chicago, IL', 'San Francisco, CA', 'Honolulu, HI'],
  GB: ['London, UK', 'Manchester, UK', 'Edinburgh, UK', 'Bath, UK', 'Lake District, UK', 'Cotswolds, UK', 'Brighton, UK', 'Oxford, UK', 'Bristol, UK', 'Liverpool, UK'],
  EU: ['Paris, France', 'Amsterdam, Netherlands', 'Berlin, Germany', 'Milan, Italy', 'Barcelona, Spain', 'Prague, Czech Republic', 'Vienna, Austria', 'Lisbon, Portugal', 'Dublin, Ireland', 'Copenhagen, Denmark'],
  JP: ['Tokyo, Japan', 'Kyoto, Japan', 'Osaka, Japan', 'Hakone, Japan', 'Niseko, Japan', 'Okinawa, Japan', 'Kanazawa, Japan', 'Sapporo, Japan', 'Nikko, Japan'],
  CA: ['Toronto, CA', 'Vancouver, CA', 'Montreal, CA', 'Banff, CA', 'Whistler, CA', 'Quebec City, CA', 'Victoria, CA', 'Kelowna, CA', 'Niagara-on-the-Lake, CA'],
  AU: ['Sydney, AU', 'Melbourne, AU', 'Bondi Beach, AU', 'Byron Bay, AU', 'Whitsundays, AU', 'Hobart, AU', 'Perth, AU', 'Cairns, AU', 'Adelaide, AU'],
  IN: ['Mumbai, IN', 'Delhi, IN', 'Bangalore, IN', 'Goa, IN', 'Jaipur, IN', 'Udaipur, IN', 'Kerala, IN', 'Agra, IN', 'Kolkata, IN', 'Chennai, IN'],
  BR: ['São Paulo, BR', 'Rio de Janeiro, BR', 'Buzios, BR', 'Salvador, BR', 'Florianopolis, BR', 'Ouro Preto, BR', 'Manaus, BR', 'Recife, BR', 'Brasilia, BR', 'Curitiba, BR'],
  ZA: ['Cape Town, ZA', 'Johannesburg, ZA', 'Durban, ZA', 'Franschhoek, ZA', 'Knysna, ZA', 'Stellenbosch, ZA', 'Port Elizabeth, ZA', 'Pretoria, ZA', 'Drakensberg, ZA'],
  NG: ['Lagos, NG', 'Abuja, NG', 'Port Harcourt, NG', 'Ibadan, NG', 'Benin City, NG', 'Kano, NG', 'Kaduna, NG', 'Uyo, NG', 'Calabar, NG', 'Enugu, NG'],
  KR: ['Seoul, KR', 'Busan, KR', 'Jeju Island, KR', 'Incheon, KR', 'Gyeongju, KR', 'Daegu, KR', 'Suwon, KR', 'Gwangju, KR', 'Jeonju, KR', 'Suncheon, KR'],
  MX: ['Mexico City, MX', 'Cancun, MX', 'Tulum, MX', 'San Miguel de Allende, MX', 'Playa del Carmen, MX', 'Los Cabos, MX', 'Oaxaca, MX', 'Merida, MX', 'Guadalajara, MX', 'Puerto Vallarta, MX']
};

const CELEBRITIES = [
  'Rihanna', 'Beyoncé', 'Harry Styles', 'Zendaya', 'Brad Pitt', 'Taylor Swift',
  'Dua Lipa', 'Michael B. Jordan', 'Billie Eilish', 'Leonardo DiCaprio',
  'Kim Kardashian', 'Johnny Depp', 'Jennifer Lopez', 'Drake', 'Lady Gaga',
  'Timothée Chalamet', 'Serena Williams', 'Cristiano Ronaldo', 'Naomi Campbell', 'Bad Bunny'
];

const DESIGNERS = [
  'Gucci', 'Versace', 'Dior', 'Balenciaga', 'Prada', 'Chanel', 'Louis Vuitton',
  'Alexander McQueen', 'Valentino', 'Off-White', 'Saint Laurent', 'Givenchy',
  'Dolce & Gabbana', 'Burberry', 'Fendi'
];

const GARMENTS = [
  'couture gown', 'custom suit', 'red carpet dress', 'jacket ensemble',
  'statement outfit', 'look', 'attire', 'robe', 'ensemble', 'statement piece'
];

const EVENTS = [
  'the Oscars', 'the Met Gala', 'the Grammys', 'a world tour',
  'the Super Bowl halftime show', 'Cannes Film Festival', 'Paris Fashion Week',
  'the Met Ball', 'the VMAs', 'a movie premiere'
];

const CAR_MAKES = [
  'Mercedes-Benz', 'BMW', 'Tesla', 'Toyota', 'Ford', 'Ferrari', 'Porsche',
  'Lamborghini', 'Rolls-Royce', 'Audi', 'Bentley', 'McLaren', 'Aston Martin',
  'Honda', 'Nissan', 'Hyundai', 'Chevrolet', 'Volkswagen', 'Volvo', 'Land Rover'
];

const CAR_MODELS = [
  'S-Class', 'M5', 'Model S', 'Camry', 'Mustang', '911', 'Aventador', 'Phantom',
  'R8', 'Urus', 'Civic', 'GT-R', 'Ioniq 5', 'Corvette', 'ID.4', 'Bentayga',
  '720S', 'DB12', 'CR-V', 'X5'
];

const GROCERY_BRANDS = [
  'Whole Foods', "Trader Joe's", 'Kroger', 'Tesco', 'Carrefour', 'Woolworths',
  'Edeka', 'Waitrose', 'Loblaw', 'Coles', 'ALDI', 'Lidl', 'Seven-Eleven',
  'FamilyMart', 'Lawson'
];

const GROCERY_PRODUCTS = [
  'organic avocados', 'artisan sourdough', 'cold brew coffee',
  'extra virgin olive oil', 'fresh blueberries', 'almond milk',
  'parmesan cheese', 'prosciutto', 'organic quinoa', 'dark chocolate bar',
  'free-range eggs', 'Greek yogurt', 'manuka honey', 'balsamic vinegar',
  'truffle oil'
];

const RIDICULOUS_ADJECTIVES = [
  '24-karat gold', 'diamond-encrusted', 'platinum-plated', 'meteorite',
  'hand-blown', 'limited edition', 'solid gold', 'titanium',
  'crystal-encrusted', 'vintage', 'iridium', 'gold-plated', 'jeweled'
];

const RIDICULOUS_MATERIALS = [
  'marble', 'titanium', 'gold', 'crystal', 'obsidian', 'silver',
  'porcelain', 'ebony', 'silk', 'carbon fiber', 'platinum'
];

const RIDICULOUS_NOUNS = [
  'golden toilet', 'diamond toaster', 'chair', 'umbrella', 'spoon',
  'door handle', 'computer mouse', 'stapler', 'mechanical keyboard',
  'rubber duck', 'toothbrush', 'fidget spinner', 'scented candle',
  'wine glass', 'smartwatch'
];

const TIERS = [
  { rank: 1, name: 'Penny Pincher', minPoints: 0, color: '#94a3b8', badge: '🪙', description: 'Just learning the price tags.' },
  { rank: 2, name: 'Bargain Browser', minPoints: 1_000, color: '#b45309', badge: '🏷️', description: 'Spots a sale when they see one.' },
  { rank: 3, name: 'Price Pupil', minPoints: 5_000, color: '#7c3aed', badge: '📚', description: 'Studying the market.' },
  { rank: 4, name: 'MSRP Master', minPoints: 15_000, color: '#0d9488', badge: '🧾', description: 'Knows the manufacturer\'s price.' },
  { rank: 5, name: 'Appraiser Apprentice', minPoints: 40_000, color: '#0e7490', badge: '🔍', description: 'In training as a valuation pro.' },
  { rank: 6, name: 'Valuation Veteran', minPoints: 75_000, color: '#059669', badge: '🏅', description: 'Seen it all, priced it all.' },
  { rank: 7, name: 'Oracle of Odds', minPoints: 150_000, color: '#7c3aed', badge: '🔮', description: 'Predicts prices like fate.' },
  { rank: 8, name: 'Grandmaster Guesser', minPoints: 300_000, color: '#f59e0b', badge: '♟️', description: 'Few can guess closer.' },
  { rank: 9, name: 'Platinum Pricer', minPoints: 600_000, color: '#e5e7eb', badge: '🧊', description: 'Platinum-standard valuation.' },
  { rank: 10, name: 'Retail Royalty', minPoints: 1_200_000, color: '#d97706', badge: '👑', description: 'The apex of price guessing.' }
];

/** 32-bit FNV-1a hash, deterministic across platforms. */
function hashCode(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Return a deterministic PRNG seeded by a 32-bit integer. */
function makeRand(seed) {
  let s = (seed >>> 0) || 0x12345678;
  return function next() {
    s = (s + 0x9e3779b9) | 0;
    let x = s;
    x = (x ^ (x >>> 16)) | 0;
    x = Math.imul(x, 0x7feb352d) | 0;
    x = (x ^ (x >>> 15)) | 0;
    x = Math.imul(x, 0x846ca68b) | 0;
    x = (x ^ (x >>> 16)) | 0;
    s = x;
    return (x >>> 0) / 0xffffffff;
  };
}

function pick(list, r) { return list[Math.floor(r() * list.length)]; }
function rangeInt(min, max, r) { return Math.floor(min + r() * (max - min + 1)); }

/**
 * Generate a deterministic item by id (1..ITEM_COUNT) for an optional country.
 * Actual price is computed in the country's currency units so the server can
 * score guesses without ever storing the item.
 */
function generateItem(itemId, countryCode) {
  if (itemId < 1 || itemId > ITEM_COUNT) throw new Error(`item id ${itemId} out of range 1..${ITEM_COUNT}`);
  const r = makeRand(hashCode(String(itemId)) ^ 0x243f6a88);
  const country = countryCode && COUNTRY_BY_CODE[countryCode] ? COUNTRY_BY_CODE[countryCode] : COUNTRIES[Math.floor(r() * COUNTRIES.length)];
  const category = CATEGORIES[Math.floor(r() * CATEGORIES.length)];
  const icon = CATEGORY_ICONS[category];

  let baseMin, baseMax, name, description;

  if (category === 'houses') {
    const style = pick(['Modern Villa', 'Beachfront Mansion', 'Penthouse Suite', 'Historic Townhouse', 'Luxury Estate', 'Mountain Chalet', 'Downtown Loft', 'Family Home', 'Waterfront Cottage', 'Castle', 'Ski Lodge', 'Vineyard Estate', 'Island Bungalow', 'Skyscraper Penthouse', 'Brownstone'], r);
    const city = pick(CITIES[country.code] || CITIES.US, r);
    const beds = rangeInt(2, 8, r);
    const baths = rangeInt(1, 6, r);
    const sqft = rangeInt(800, 15000, r);
    baseMin = 350000; baseMax = 4500000;
    name = `${style} in ${city}`;
    description = `${beds} beds • ${baths} baths • ${sqft.toLocaleString()} sqft • ${city}`;
  } else if (category === 'celebrity_outfits') {
    const celebrity = pick(CELEBRITIES, r);
    const designer = pick(DESIGNERS, r);
    const garment = pick(GARMENTS, r);
    const event = pick(EVENTS, r);
    baseMin = 1200; baseMax = 250000;
    name = `${celebrity}'s ${designer} ${garment} at ${event}`;
    description = `Worn by ${celebrity} at ${event}. Designed by ${designer}. One-of-a-kind.`;
  } else if (category === 'cars') {
    const year = rangeInt(2015, 2026, r);
    const make = pick(CAR_MAKES, r);
    const model = pick(CAR_MODELS, r);
    baseMin = 18000; baseMax = 2200000;
    name = `${year} ${make} ${model}`;
    description = `${year} ${make} ${model} — premium trim, verified low mileage.`;
  } else if (category === 'groceries') {
    const brand = pick(GROCERY_BRANDS, r);
    const product = pick(GROCERY_PRODUCTS, r);
    const count = rangeInt(1, 12, r);
    baseMin = 2; baseMax = 90;
    name = `${brand} ${product} ×${count}`;
    description = `${count} pack of ${product} from ${brand}.`;
  } else {
    const adj = pick(RIDICULOUS_ADJECTIVES, r);
    const material = pick(RIDICULOUS_MATERIALS, r);
    const noun = pick(RIDICULOUS_NOUNS, r);
    baseMin = 12; baseMax = 950000;
    name = `${adj} ${material} ${noun}`;
    description = 'Absolutely unnecessary. Absolutely desirable. A true collector\'s piece.';
  }

  const variance = 0.55 + r() * 0.9; // 0.55 .. 1.45
  let priceUnits;
  if (country.fractionDigits === 0) {
    // zero-decimal currencies (JPY, KRW, NGN, INR): already in major units
    priceUnits = Math.round((baseMin + r() * (baseMax - baseMin)) * variance * country.multiplier);
  } else {
    priceUnits = Math.round((baseMin + r() * (baseMax - baseMin)) * variance * country.multiplier * 100); // minor units (cents)
  }

  return {
    id: itemId,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    icon: icon,
    country: country.code,
    countryName: country.name,
    currency: country.currency,
    symbol: country.symbol,
    fractionDigits: country.fractionDigits,
    name,
    description,
    priceUnits,            // actual price in currency units (server-side only)
    basePriceUsd: Math.round((baseMin + (baseMax - baseMin) / 2)), // indicative
    image: itemImage(itemId, category)
  };
}

function itemImage(itemId, category) {
  const emoji = CATEGORY_ICONS[category];
  const grad = CATEGORY_GRADIENTS[category];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><text x="50%" y="45%" font-family="system-ui, sans-serif" font-size="140" text-anchor="middle" fill="#d4af37" style="letter-spacing:8px">${emoji}</text><text x="50%" y="78%" font-family="system-ui, sans-serif" font-size="26" text-anchor="middle" fill="#94a3b8" letter-spacing="6px">ITEM #${itemId}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + svg;
}

/** Format a price value (in minor units for 2-decimal currencies) for display. */
function formatPrice(priceUnits, countryCode) {
  const country = COUNTRY_BY_CODE[countryCode] || COUNTRIES[0];
  const value = country.fractionDigits === 0 ? priceUnits : priceUnits / 100;
  return value.toLocaleString(undefined, { minimumFractionDigits: country.fractionDigits === 0 ? 0 : 2, maximumFractionDigits: country.fractionDigits === 0 ? 0 : 2 });
}

module.exports = { ITEM_COUNT, CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_GRADIENTS, COUNTRIES, COUNTRY_BY_CODE, TIERS, generateItem, formatPrice, hashCode };
