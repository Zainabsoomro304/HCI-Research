import { afterEach, describe, expect, it } from "vitest";
import { loadInstrument } from "@/lib/questionnaire/instruments";

const licensed = {
  instrument: "quis",
  version: "licensed-test",
  placeholder: false,
  title: "Licensed title",
  instructions: "Rate the shop.",
  items: [{ id: "q_overall_1", text: "terrible / wonderful", scale: { min: 0, points: 10, leftAnchor: "terrible", rightAnchor: "wonderful" }, allowNA: true }],
};

describe("questionnaire lookup", () => {
  afterEach(() => {
    delete process.env.INSTRUMENT_QUIS_EN;
    delete process.env.INSTRUMENT_QUIS_UR;
  });

  it("uses the committed file when no private copy exists", () => {
    const ues = loadInstrument("ues_sf", "ur");
    expect(ues.origin).toBe("repo");
    expect(ues.placeholder).toBe(false);
  });

  it("prefers a licensed copy from the environment, and falls back to English for a missing language", () => {
    process.env.INSTRUMENT_QUIS_EN = JSON.stringify(licensed);
    const en = loadInstrument("quis", "en");
    expect(en.origin).toBe("env");
    expect(en.version).toBe("licensed-test");
    expect(en.items.map((i) => i.id)).toEqual(["q_overall_1"]);
    // No Urdu licensed copy: the English licensed copy is used rather than the Urdu placeholder.
    expect(loadInstrument("quis", "ur").version).toBe("licensed-test");
    process.env.INSTRUMENT_QUIS_UR = JSON.stringify({ ...licensed, version: "licensed-ur", title: "عنوان" });
    expect(loadInstrument("quis", "ur").version).toBe("licensed-ur");
  });

  it("rejects an invalid licensed copy loudly", () => {
    process.env.INSTRUMENT_QUIS_EN = JSON.stringify({ ...licensed, items: [] });
    expect(() => loadInstrument("quis", "en")).toThrow(/Invalid INSTRUMENT_QUIS_EN/);
  });
});
