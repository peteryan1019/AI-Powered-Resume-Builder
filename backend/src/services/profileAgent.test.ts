import { describe, expect, it } from "vitest";
import { SECTION_FIELDS, updateIsAnchored } from "./profileAgent.js";

describe("profile agent: update anchoring", () => {
  const notes = [
    {
      about: "Add Explicit Mention of Unix/Linux Environments",
      text: "As part of school work, i have also coded up a Linux shell script that serves to filter, organize, and process csv documents.",
    },
  ];

  it("refuses an update the user's words never point at", () => {
    // The real failure: the model matched this note to an existing Android
    // project because both opened "as part of coursework". It could not quote
    // anything naming that project, because the user never referred to it.
    expect(updateIsAnchored("University Event App", notes)).toBe(false);
    expect(updateIsAnchored("that Android app", notes)).toBe(false);
  });

  it("accepts a loose but real reference", () => {
    expect(updateIsAnchored("Linux shell script", notes)).toBe(true);
    expect(
      updateIsAnchored("robot soccer", [
        { about: "Reorder Projects", text: "The robot soccer one also used C++." },
      ]),
    ).toBe(true);
    expect(
      updateIsAnchored("that Epoch Media Group internship", [
        { about: "Impact", text: "I did use AI in that Epoch Media Group internship." },
      ]),
    ).toBe(true);
  });

  it("lets a terse reply be anchored by the recommendation it answers", () => {
    // Real replies name nothing: "i just haven't added that to my profile yet".
    // The entry meant is named in the recommendation, so that counts as part of
    // what the user said -- otherwise every short reply was refused, and the
    // writer then put the claim in the resume with no profile entry to support
    // it, and the next coach round called the user a fabricator.
    const terse = [
      {
        about: "Remove Fabricated Claim About LLM Usage at Epoch",
        text: "i just haven't added that to my profile yet.",
      },
    ];
    expect(updateIsAnchored("Epoch", terse)).toBe(true);
    expect(updateIsAnchored("LLM Usage at Epoch", terse)).toBe(true);
    // Still refused when it names something neither the note nor the
    // recommendation mentions.
    expect(updateIsAnchored("University Event App", terse)).toBe(false);
  });

  it("ignores case and whitespace, since the model retypes the quote", () => {
    expect(updateIsAnchored("LINUX   SHELL\nSCRIPT", notes)).toBe(true);
  });

  it("refuses an empty or trivially short anchor", () => {
    expect(updateIsAnchored("", notes)).toBe(false);
    expect(updateIsAnchored("  ", notes)).toBe(false);
    expect(updateIsAnchored("a", notes)).toBe(false);
    expect(updateIsAnchored(undefined, notes)).toBe(false);
  });

  it("keeps every section's fields in step with the profile form", () => {
    // These lists mirror the instance form's own field map; a form gaining a
    // field it cannot receive would silently drop the agent's value.
    expect(SECTION_FIELDS.PROJECTS).toContain("name");
    expect(SECTION_FIELDS.PROJECTS).not.toContain("title");
    expect(SECTION_FIELDS.CERTIFICATIONS).toContain("issuer");
    expect(SECTION_FIELDS.CERTIFICATIONS).toContain("date");
    expect(SECTION_FIELDS.CERTIFICATIONS).not.toContain("startDate");
    expect(SECTION_FIELDS.SKILLS).toEqual(["category", "skillsRaw"]);
  });
});
