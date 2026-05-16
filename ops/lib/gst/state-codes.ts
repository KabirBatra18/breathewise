/**
 * GST state codes per CBIC's standard 2-digit codes for the 36
 * states/UTs. Used to auto-populate state_code from free-text state
 * names on clients and on invoice ship-to addresses, so the user
 * never has to memorise codes.
 *
 * Returns null for unrecognised names — caller decides how to surface.
 */

const STATE_CODE_MAP: Record<string, string> = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  gujarat: "24",
  "dadra and nagar haveli and daman and diu": "26",
  maharashtra: "27",
  karnataka: "29",
  goa: "30",
  lakshadweep: "31",
  kerala: "32",
  "tamil nadu": "33",
  puducherry: "34",
  "andaman and nicobar islands": "35",
  telangana: "36",
  "andhra pradesh": "37",
  ladakh: "38",
};

export function deriveStateCode(stateName: string | null | undefined): string | null {
  if (!stateName) return null;
  const k = stateName.trim().toLowerCase();
  return STATE_CODE_MAP[k] ?? null;
}

/**
 * Display-ready list of all 36 Indian states + UTs sorted by GST
 * code. Used by the StateSelect dropdown so the user picks from a
 * canonical list — no typos, no auto-derive failures.
 *
 * Big states (the ones BreatheWise actually quotes) appear first
 * for ergonomics, then everything else alphabetically. Each entry
 * carries the Title-Case display name so the form prints "Delhi"
 * not "delhi" or "DELHI".
 */
export interface StateOption {
  name: string;
  code: string;
}

const TITLE_CASE: Record<string, string> = {
  "jammu and kashmir": "Jammu and Kashmir",
  "himachal pradesh": "Himachal Pradesh",
  punjab: "Punjab",
  chandigarh: "Chandigarh",
  uttarakhand: "Uttarakhand",
  haryana: "Haryana",
  delhi: "Delhi",
  rajasthan: "Rajasthan",
  "uttar pradesh": "Uttar Pradesh",
  bihar: "Bihar",
  sikkim: "Sikkim",
  "arunachal pradesh": "Arunachal Pradesh",
  nagaland: "Nagaland",
  manipur: "Manipur",
  mizoram: "Mizoram",
  tripura: "Tripura",
  meghalaya: "Meghalaya",
  assam: "Assam",
  "west bengal": "West Bengal",
  jharkhand: "Jharkhand",
  odisha: "Odisha",
  chhattisgarh: "Chhattisgarh",
  "madhya pradesh": "Madhya Pradesh",
  gujarat: "Gujarat",
  "dadra and nagar haveli and daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  maharashtra: "Maharashtra",
  karnataka: "Karnataka",
  goa: "Goa",
  lakshadweep: "Lakshadweep",
  kerala: "Kerala",
  "tamil nadu": "Tamil Nadu",
  puducherry: "Puducherry",
  "andaman and nicobar islands": "Andaman and Nicobar Islands",
  telangana: "Telangana",
  "andhra pradesh": "Andhra Pradesh",
  ladakh: "Ladakh",
};

// Order matters: BreatheWise is in Delhi/NCR so the NCR-belt + nearby
// states come first; everything else alphabetical.
const PRIORITY_KEYS = [
  "delhi",
  "haryana",
  "uttar pradesh",
  "rajasthan",
  "punjab",
  "uttarakhand",
  "chandigarh",
  "maharashtra",
  "gujarat",
  "karnataka",
  "tamil nadu",
];

export const INDIAN_STATES: StateOption[] = (() => {
  const priority = PRIORITY_KEYS.map((k) => ({
    name: TITLE_CASE[k],
    code: STATE_CODE_MAP[k],
  }));
  const others = Object.keys(STATE_CODE_MAP)
    .filter((k) => !PRIORITY_KEYS.includes(k))
    .sort((a, b) => TITLE_CASE[a].localeCompare(TITLE_CASE[b]))
    .map((k) => ({ name: TITLE_CASE[k], code: STATE_CODE_MAP[k] }));
  return [...priority, ...others];
})();
