/**
 * Consumer-facing one-line descriptions for every Astberg product
 * subcategory. Used as the default `description` text when an item
 * is added to a quote — short enough to fit a quote line, but tells
 * the customer *why* the part matters.
 *
 * Keep these crisp. Quote PDFs are the first time most clients see
 * the spec; long marketing copy reads as filler.
 */

export const SUBCATEGORY_DESCRIPTIONS: Record<string, string> = {
  // ── Inline Fans ────────────────────────────────────────────────
  "AF Series — Mix Flow Inline Fan":
    "High-pressure inline fan that keeps airflow strong through long ducts.",
  "ASMK Series — Mixed Flow with Silencer":
    "Mixed-flow inline fan with built-in silencer — powerful airflow at near-bedroom noise levels.",
  "ATMK Series — Mixed Flow Fan":
    "Mixed-flow inline fan tuned for steady, efficient airflow across mid-length ducts.",
  "AFB Series — Black Mix Flow Inline Fan":
    "Mixed-flow inline fan in matte black — same performance, designed to look good on visible runs.",
  "AEE Series — Circular Duct Fan":
    "Compact inline duct fan for everyday whole-room ventilation in 100–450mm pipes.",
  "Typhoon Series":
    "High-velocity inline blower for long, demanding duct runs that choke smaller fans.",
  "AEC Series — Inline Fan with Speed Controller":
    "Inline fan with built-in speed control — dial airflow up for cooking, down for sleep.",

  // ── Specialty Fans ────────────────────────────────────────────
  "Micro Jet Fan":
    "Compact jet fan for small enclosed spaces; delivers a focused, high-velocity stream.",
  "ADD Series — Mix Flow Silent Fan":
    "Engineered for whisper-quiet operation — full-power ventilation you can barely hear.",
  "AHT Series — Kitchen Fan":
    "Heavy-duty metal kitchen exhaust; handles smoke, oil and steam without clogging.",
  "ASP/ASE Series — Ceiling Mount Fan":
    "Recessed ceiling exhaust fan — clean ceiling line, ducted away discreetly.",
  "ASP Series — Ceiling Mount Fan (Alternative)":
    "Slim-profile ceiling exhaust for tighter ceiling cavities.",
  "APT Series — Ceiling Mount Cassette Type Fan":
    "Cassette-style ceiling fan; sits flush in the ceiling for a designer finish.",
  "ASL Series — Ceiling Mounted Exhaust with Light":
    "Ceiling exhaust fan with integrated LED light — ventilation and lighting in one fixture.",
  "AHA Series — Propeller Fan":
    "Wall-mounted propeller fan; high-volume air movement for kitchens, garages, and warehouses.",
  "AHI Series — Booster Fan":
    "Inline booster that revives airflow when long ducts choke the primary fan.",
  "AFP Series — 2-IN-1 Fresh Air Box":
    "Fresh-air supply box with built-in filter; brings outdoor air in, cleaned and ready to breathe.",
  "AFV Series — Fresh Air Purifier":
    "Pulls in outdoor air, strips out pollutants, delivers clean fresh air to the room.",
  "ASF — Ultra Slim Fan":
    "Slim-profile exhaust fan for tight spaces where a standard fan won't fit.",
  "AFV-DP Series — Cabinet Fan with Pre-Filter":
    "Cabinet-mounted fan with a washable pre-filter — clean intake air, simple to maintain.",
  "ABF Series — Air Box Fan":
    "Compact in-line air box for ducted ventilation in bathrooms and small rooms.",
  "ASHT Series — Portable Blower Fan with Duct":
    "Portable blower with flex duct; targeted ventilation wherever you temporarily need it.",
  "ARMD Series — Roof and Wall Exhaust Fan":
    "Heavy-duty roof or wall exhaust; handles continuous high-volume extraction.",
  "AL Series — Exhaust Fan with Light":
    "Exhaust fan with built-in light — ventilates and illuminates utility areas in one fixture.",

  // ── Domestic Fans ─────────────────────────────────────────────
  "Domestic Fans":
    "Compact domestic exhaust fan; quiet daily-use airflow for bathrooms and small rooms.",

  // ── Accessories ───────────────────────────────────────────────
  "ADD — ABS Disk Diffuser with Volume Controller Valve":
    "Ceiling disk diffuser with adjustable volume — balance airflow per room without tools.",
  "APP — Round Air Outlet":
    "Round ceiling outlet that distributes supply air evenly without throwing a draft.",
  "ASD — 3-Step Diffuser":
    "3-step ceiling diffuser; precise air distribution with minimal noise.",
  "ARD — Rotating Grill Diffuser":
    "Rotating grill — aim airflow exactly where the room needs it.",
  "ARG — Round Grill":
    "Round air grill; finishes the duct end with a clean wall or ceiling look.",
  "AYJ — Y Joint PVC":
    "PVC Y-junction; merges two duct lines into one without losing flow.",
  "ASC — Outer Steel Cowl (Steel Finish, SS304)":
    "Stainless-steel exterior cowl — protects the duct opening from rain, debris, and birds.",
  "ASC-P — Outer Steel Cowl (Powder Coated SUS304, premium line)":
    "Powder-coated SS304 cowl — premium weatherproof finish for visible exterior runs.",
  "AWC — ABS Wall Cowl / PVC Long Pipe Cowl":
    "Lightweight ABS exterior cowl with built-in insect guard for the outer pipe end.",
  "ASG — Outer Flat Grill Steel":
    "Flat steel exterior grill; flush-mounted finish that keeps insects and debris out.",
  "AVG — Varanda Grill":
    "Verandah-style outer grill; protects the duct opening on balconies and exterior walls.",
  "APF — ABS Pre Filter":
    "Washable pre-filter that catches dust before it reaches the fan or HEPA stage.",
  "AEB — ABS Ball Jet Nozzle":
    "Adjustable ball-jet nozzle — aim supply air precisely where occupants sit.",
  "AGD — Astberg Gravity Damper / Air Fresh Pipeline Check Valve":
    "One-way gravity damper; lets exhaust out, blocks back-flow when the fan is off.",
  "APB — Air Purification Box (UV Light Filter Box)":
    "In-duct UV purification — sterilises the air as it passes through.",
  "AVC — ABS Air Volume Control Valve":
    "Inline air volume valve; balance airflow between rooms without re-routing duct.",
  "ABC — Beam Crosser Lantel Device Adaptor":
    "Lateral device adapter; routes ducts cleanly across structural beams without surgery.",
  "ALM — Aluminium Flexible Duct (3 metres)":
    "Aluminium flex duct; bends around obstacles while keeping the air path smooth.",
  "AFD — Insulated PVC Flexible Duct":
    "Insulated flexible duct; reduces condensation and noise on long indoor runs.",
  "ARD — ABS Reducer":
    "ABS pipe reducer; mates two different duct diameters without leaks or flow loss.",
  "ANR — Noise Reducer":
    "Inline acoustic silencer; knocks down fan and duct noise on its way through.",
  "ACL — PVC Clamps":
    "PVC duct clamps; secure joints and supports without tools.",
  "ASL — Steel Grip Clamp":
    "Steel grip clamp; tight, durable hold for outdoor and high-pressure runs.",
  "AOG — ABS Oblique Air Grill":
    "Oblique-vane ABS grill; directs supply air sideways so it doesn't blow on you.",
  "AFG — ABS Fancy Air Grill":
    "Decorative ABS grill; finishes interior duct ends with a designer look.",
  "APE — Double Wall Corrugated Flexible Duct (Pipe)":
    "Double-wall corrugated duct; rugged and flexible — ideal for outdoor or buried runs.",
  "ABB — Branch Box":
    "Duct branch box; splits one supply trunk into multiple room takeoffs cleanly.",
  "PE — Pipe Connectors":
    "PE pipe connectors; reliable, leak-tight joints between supply duct sections.",

  // ── ERV / HRV ─────────────────────────────────────────────────
  "ASF / AT Series":
    "Compact energy-recovery ventilator; brings in filtered fresh air, exhausts stale air, recovers heating/cooling energy.",
  "AHE-D Series — Pre-Filter ERV (compact)":
    "Compact pre-filter ERV for small homes; fresh outdoor air with energy recovery in a tight footprint.",
  "AHE-THP Series — HEPA + Carbon ERV":
    "ERV with HEPA + activated-carbon filtration — outdoor-grade fresh air, indoor-grade purity.",
  "AHE-TH Series — Pre-Filter ERV (mid)":
    "Mid-size pre-filter ERV; balanced supply and exhaust for medium-floor homes.",
  "AHE-THB Series — Pre-Filter ERV (large)":
    "Large-capacity pre-filter ERV; whole-floor fresh air with energy recovery.",
  "AHC Series — With Return Air Filter":
    "ERV with an extra return-air filter — cleans recirculated indoor air on its way back too.",
  "Darwin Series — IFD Filters":
    "Premium ERV with IFD electronic filters — washable, capture down to PM0.1, zero replacement filters.",
};

export function defaultDescriptionFor(
  subcategory: string | null | undefined,
): string | null {
  if (!subcategory) return null;
  return SUBCATEGORY_DESCRIPTIONS[subcategory] ?? null;
}
