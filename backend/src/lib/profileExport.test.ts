import { describe, expect, it } from "vitest";
import { formatInstance } from "./profileExport.js";

const format = (type: Parameters<typeof formatInstance>[0], data: Record<string, unknown>) =>
  formatInstance(type, { data } as never);

// A row saved by the old form, before the fields were collapsed into one
// description box. Nothing migrates these in the database, so the exporter has
// to keep reading them for as long as they exist.
const legacyWork = {
  company: "Acme",
  title: "Backend Developer",
  location: "Toronto, ON",
  summary: "Owned the billing service.",
  technologies: ["TypeScript", "PostgreSQL"],
  bullets: ["Cut p99 latency by 40%.", "Migrated 12M rows with zero downtime."],
  startDate: "2023-01",
  endDate: "2024-06",
};

// The same role as the simplified form saves it: one free-text description.
const simplifiedWork = {
  company: "Acme",
  title: "Backend Developer",
  location: "Toronto, ON",
  description:
    "Owned the billing service, built in TypeScript on PostgreSQL. Cut p99 latency by 40% and migrated 12M rows with zero downtime.",
  startDate: "2023-01",
  endDate: "2024-06",
};

describe("formatInstance — legacy profile rows", () => {
  it("still exports a legacy work row's summary, technologies and bullets", () => {
    const { title, date, description } = format("WORK_EXPERIENCE", legacyWork);

    expect(title).toBe("Backend Developer — Acme");
    expect(date).toBe("2023-01 – 2024-06");
    expect(description).toContain("Toronto, ON");
    expect(description).toContain("Owned the billing service.");
    expect(description).toContain("Technologies: TypeScript, PostgreSQL");
    expect(description).toContain("Cut p99 latency by 40%.");
    expect(description).toContain("Migrated 12M rows with zero downtime.");
  });

  it("still exports a legacy education row's bullets alongside its GPA", () => {
    const { description } = format("EDUCATION", {
      school: "UofT",
      degree: "BSc",
      gpa: "3.8",
      bullets: ["Dean's List 2021", "Coursework: Distributed Systems"],
    });

    expect(description).toContain("Dean's List 2021");
    expect(description).toContain("Coursework: Distributed Systems");
    expect(description).toContain("GPA: 3.8");
  });

  it("still exports a legacy project's url, technologies and custom details", () => {
    const { description } = format("PROJECTS", {
      name: "Tailr",
      url: "https://github.com/x/tailr",
      summary: "Resume builder.",
      technologies: ["Angular"],
      customDetails: [{ label: "Users", value: "300" }],
      bullets: ["Shipped the PDF pipeline."],
    });

    expect(description).toContain("https://github.com/x/tailr");
    expect(description).toContain("Technologies: Angular");
    expect(description).toContain("Users: 300");
    expect(description).toContain("Shipped the PDF pipeline.");
  });
});

describe("formatInstance — simplified profile rows", () => {
  it("exports the free-text description for a work row", () => {
    const { title, description } = format("WORK_EXPERIENCE", simplifiedWork);

    expect(title).toBe("Backend Developer — Acme");
    expect(description).toContain("Toronto, ON");
    expect(description).toContain("Cut p99 latency by 40%");
  });

  it("emits no empty separators when only a description is present", () => {
    const { description } = format("PROJECTS", {
      name: "Tailr",
      description: "A resume builder.",
    });

    expect(description).toBe("A resume builder.");
  });

  it("exports education coursework written as prose, with no bullets array", () => {
    const { description } = format("EDUCATION", {
      school: "UofT",
      degree: "BSc",
      description: "Relevant coursework: Distributed Systems, Databases. Held the Dean's scholarship.",
    });

    expect(description).toContain("Distributed Systems");
    expect(description).toContain("Dean's scholarship");
  });

  it("reads a row that carries both shapes, keeping the new description first", () => {
    const { description } = format("VOLUNTEER", {
      organization: "Code for Canada",
      role: "Mentor",
      description: "Mentored three junior developers.",
      bullets: ["Ran weekly code reviews."],
    });

    expect(description).toBe("Mentored three junior developers. Ran weekly code reviews.");
  });
});
