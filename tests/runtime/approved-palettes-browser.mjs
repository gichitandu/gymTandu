// Only the isolated localhost fixture. Never touches production preferences or archives.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { APPROVED_THEME_PALETTES } from "../../shared/approved-palettes.js";
const { chromium } = await import(
  process.env.GYMTRACK_PLAYWRIGHT_MODULE || "playwright"
);
const output = "docs/qa/approved-palettes";
await mkdir(output, { recursive: true });
const origin = "http://localhost:4173",
  password = "fixture-only-test-password";
const browser = await chromium.launch({
  executablePath: process.env.GYMTRACK_CHROMIUM || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    serviceWorkers: "block",
  }),
  page = await context.newPage();
const errors = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
const mark = (name) => {
  results.push(name);
  console.log("PASS", name);
};
const request = async (path, body) => {
  const response =
    body === undefined
      ? await context.request.get(origin + "/api/" + path)
      : await context.request.post(origin + "/api/" + path, {
          headers: { Origin: origin },
          data: body,
        });
  assert.ok(response.ok(), path + ": " + response.status());
  return response.json();
};
const openTheme = async () => {
  await page.goto(origin + "/#/profilo?section=theme");
  await page.locator(".theme-studio").waitFor();
};
try {
  await context.request.post(origin + "/api/auth/setup", {
    headers: { Origin: origin },
    data: { password },
  });
  await request("auth/login", {
    email: "giacomotanduo004@gmail.com",
    password,
  });
  await openTheme();
  const picker = page.locator(".theme-studio");
  await picker.locator('[data-palette-id="blu-azzurro"]').waitFor();
  assert.equal(
    await picker
      .locator('[data-palette-group="approved"] .palette-tile')
      .count(),
    8,
  );
  assert.equal(
    await picker
      .locator('[data-palette-group="standard"] .palette-tile')
      .count(),
    7,
  );
  mark(
    "Eight approved palettes visible first, with all seven existing themes retained",
  );
  let saved = (await request("preferences")).themeConfig;
  for (const palette of APPROVED_THEME_PALETTES) {
    await openTheme();
    await picker.locator('[data-palette-id="' + palette.id + '"]').click();
    await page.waitForFunction(
      (background) =>
        document
          .querySelector(".theme-studio")
          .style.getPropertyValue("--preview-bg")
          .trim() === background,
      palette.background,
    );
    assert.deepEqual((await request("preferences")).themeConfig, saved);
    assert.equal(
      await picker.evaluate((el) =>
        el.style.getPropertyValue("--preview-bg").trim(),
      ),
      palette.background,
    );
    // A temporary custom background and its reset never write to the published app.
    await picker.locator(".advanced-colors > summary").click();
    const background = picker.getByRole("textbox", {
      name: "Sfondo · HEX",
      exact: true,
    });
    await background.fill("#112233");
    await background.press("Tab");
    await picker
      .getByRole("button", {
        name: "Ripristina colori della palette",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      (background) =>
        document
          .querySelector(".theme-studio")
          .style.getPropertyValue("--preview-bg")
          .trim() === background,
      palette.background,
    );
    const savedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/preferences") &&
        response.request().method() === "POST" &&
        response.status() === 200,
    );
    await picker
      .getByRole("button", { name: "Salva tema", exact: true })
      .click();
    await savedResponse;
    await page.waitForFunction(
      (id) => document.body.dataset.themePalette === id,
      palette.id,
    );
    saved = { palette: palette.id, mode: "dark" };
    assert.deepEqual((await request("preferences")).themeConfig, saved);
    await page.goto(origin + "/#/");
    await page.locator('[data-design-id="home.stats.workouts"]').waitFor();
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.body).getPropertyValue("--bg").trim(),
      ),
      palette.background,
    );
    const primary = page.locator('[data-design-id="home.actions.schedule"]');
    await primary.waitFor();
    const link = await primary.getAttribute("href");
    assert.ok(link.includes("/calendario"));
    if (palette.finish === "satin") {
      const image = await primary.evaluate(
        (el) => getComputedStyle(el).backgroundImage,
      );
      for (const color of [palette.buttonStart, palette.buttonEnd]) {
        const rgb =
          "rgb(" +
          [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).join(", ") +
          ")";
        assert.ok(
          image.includes(rgb),
          palette.id + " expected stop " + color + " in " + image,
        );
      }
    }
    await page.reload();
    await page.locator('[data-design-id="home.stats.workouts"]').waitFor();
    await page.waitForFunction(
      (id) => document.body.dataset.themePalette === id,
      palette.id,
    );
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.body).getPropertyValue("--bg").trim(),
      ),
      palette.background,
    );
    await page.screenshot({
      path: output + "/" + palette.id + "-home.png",
      fullPage: false,
    });
    mark(
      palette.name + ": preview, reset, save, real Home gradient and reload",
    );
  }
  await openTheme();
  await page.screenshot({
    path: output + "/personal-theme-picker.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  mark("Personal theme selector has no horizontal overflow at 390px");
  // Restore the fixture's original theme before testing Studio independently.
  await request("preferences", {
    backgroundColor: "#131221",
    themeConfig: { palette: "multicolore", mode: "dark" },
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(origin + "/#/design-studio");
  await page.locator(".studio-properties").waitFor();
  await page
    .getByRole("button", { name: "Temi e preset", exact: true })
    .click();
  await page.locator(".studio-palette-approved").first().waitFor();
  assert.equal(await page.locator(".studio-palette-approved").count(), 8);
  assert.equal(await page.locator(".studio-palette-legacy").count(), 12);
  const published = await request("design/published");
  for (const palette of APPROVED_THEME_PALETTES) {
    await page
      .locator('.studio-palette-approved[data-palette-id="' + palette.id + '"]')
      .click();
    await page.waitForFunction(
      (background) =>
        document
          .querySelector(".preview-phone")
          .style.getPropertyValue("--bg")
          .trim() === background,
      palette.background,
    );
    const primary = page.locator(
      'gt-design-preview [data-design-id="home.actions.schedule"]',
    );
    await primary.waitFor();
    assert.equal(
      await page
        .locator('gt-design-preview [data-design-id="home.title"]')
        .evaluate((el) => getComputedStyle(el).boxShadow),
      "none",
    );
    assert.deepEqual(await request("design/published"), published);
  }
  await page.screenshot({
    path: output + "/studio-approved-presets.png",
    fullPage: true,
  });
  mark(
    "Studio previews all eight approved presets without publishing; twelve original factories preserved",
  );
  await page
    .getByRole("button", { name: "Annulla", exact: true })
    .first()
    .click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Scarta bozza", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "Bozza rimossa" }).waitFor();
  assert.deepEqual(await request("design/published"), published);
  assert.deepEqual(errors, []);
  mark("Cancel preserves publication; no browser application exceptions");
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} catch (error) {
  await page.screenshot({
    path: "/tmp/approved-palettes-failure.png",
    fullPage: true,
  });
  console.log("Browser errors", errors);
  throw error;
} finally {
  await browser.close();
}
