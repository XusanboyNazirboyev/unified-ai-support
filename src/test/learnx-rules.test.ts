import { describe, expect, it } from "vitest";

import { courseForAgent, normalizeLearnxBaseUrl, parseLearnxCatalog } from "@/lib/learnx-rules";

const sample = {
  success: true,
  data: {
    courses: [
      {
        id: 1,
        name: "Frontend",
        description: "React",
        price: "800000.00",
        durationMonth: 6,
        durationHours: 144,
        groups: [
          {
            name: "FN-12",
            status: "PLANNED",
            startDate: "2026-11-03T00:00:00.000Z",
            maxStudent: 16,
            enrolled: 10,
            schedules: [
              { weekDay: "FRIDAY", startTime: "14:00", endTime: "16:00" },
              { weekDay: "MONDAY", startTime: "14:00", endTime: "16:00" },
            ],
          },
          { name: "FN-09", status: "COMPLETED", maxStudent: 16, enrolled: 16, schedules: [] },
          { name: "FN-11", status: "ACTIVE", maxStudent: 12, enrolled: 12, schedules: [] },
        ],
      },
    ],
  },
};

describe("learnX catalog", () => {
  it("reads the wrapped learnX response", () => {
    const courses = parseLearnxCatalog(sample);
    expect(courses?.[0]?.price).toBe(800000);
  });

  it("states the exact course price", () => {
    const course = parseLearnxCatalog(sample)![0]!;
    expect(courseForAgent(course).price_per_month).toBe("800 000 so'm");
  });

  it("offers only groups a new student can join (not finished, not full)", () => {
    const course = parseLearnxCatalog(sample)![0]!;
    expect(courseForAgent(course).open_groups.map((g) => g.group)).toEqual(["FN-12"]);
  });

  it("shows the schedule in week order with times", () => {
    const course = parseLearnxCatalog(sample)![0]!;
    expect(courseForAgent(course).open_groups[0]!.schedule).toEqual(["dushanba 14:00–16:00", "juma 14:00–16:00"]);
  });

  it("rejects a response that is not a catalog", () => {
    expect(parseLearnxCatalog({ success: false, message: "Unauthorized" })).toBeNull();
  });
});

describe("normalizeLearnxBaseUrl", () => {
  it("trims slashes and a pasted catalog path", () => {
    expect(normalizeLearnxBaseUrl("https://api.learnx.uz/api/integrations/javobchi/catalog/")).toBe("https://api.learnx.uz/api");
  });
  it("requires https", () => {
    expect(normalizeLearnxBaseUrl("http://1.2.3.4:3000")).toBeNull();
  });
});
