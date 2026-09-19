import { test, expect, type Locator } from "@playwright/test";

async function height(el: Locator): Promise<number> {
  const box = await el.boundingBox();
  if (!box) throw new Error("element has no box");
  return box.height;
}

test.describe("control sizing", () => {
  // Guards the regression where a default-size input sat next to smaller buttons.
  test("data table toolbar controls share one height", async ({ page }) => {
    await page.goto("/ui/components/data-table");
    const columns = page.getByRole("button", { name: "Columns" });
    const facet = page.getByRole("button", { name: "Filter by Status" });
    // The input in the same toolbar as the Columns button.
    const toolbar = columns.locator("xpath=..");
    const input = toolbar.getByRole("textbox");

    const [hInput, hFacet, hColumns] = await Promise.all([height(input), height(facet), height(columns)]);
    expect(hFacet).toBeCloseTo(hInput, 0);
    expect(hColumns).toBeCloseTo(hInput, 0);
  });

  // A default text control and a default button-style control resolve to the same
  // shared --control-md token, so they line up out of the box.
  test("a default input and a default button-style control are the same height", async ({ page }) => {
    await page.goto("/ui/components/input");
    const inputHeight = await height(page.getByRole("textbox").first());

    await page.goto("/ui/components/combobox");
    const comboHeight = await height(page.getByRole("combobox").first());

    expect(comboHeight).toBeCloseTo(inputHeight, 0);
  });
});
