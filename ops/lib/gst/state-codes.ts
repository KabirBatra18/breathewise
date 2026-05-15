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
