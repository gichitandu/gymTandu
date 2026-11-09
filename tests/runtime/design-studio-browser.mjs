// Run against the loopback fixture; never connects to the published Site.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const outputDirectory = process.env.GYMTRACK_QA_OUTPUT || "docs/qa";
await mkdir(outputDirectory, { recursive: true });
const { chromium } = await import(
  process.env.GYMTRACK_PLAYWRIGHT_MODULE || "playwright"
);
const origin = "http://localhost:4173",
  password = "fixture-only-test-password";
const browser = await chromium.launch({
  executablePath: process.env.GYMTRACK_CHROMIUM || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    serviceWorkers: "block",
  }),
  page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
const call = async (path, body, ctx = context) => {
  const response =
    body === undefined
      ? await ctx.request.get(origin + "/api/" + path)
      : await ctx.request.post(origin + "/api/" + path, {
          headers: { Origin: origin },
          data: body,
        });
  assert.ok(
    response.ok(),
    path + " " + response.status() + ": " + (await response.text()),
  );
  return response.json();
};
const mark = (name) => {
  results.push(name);
  console.log("PASS", name);
};
const confirm = async (label) => {
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: label, exact: true })
    .click();
};
const previewControl = (id) =>
  page.locator('gt-design-preview [data-design-id="' + id + '"]');
const waitStudio = () =>
  page.locator(".studio-properties").waitFor({ timeout: 20000 });
const number = async (name, value) => {
  const field = page.getByRole("spinbutton", {
    name: name + " valore",
    exact: true,
  });
  await field.fill(String(value));
  await field.press("Tab");
};
const appearance = async (locator) =>
  locator.evaluate((el) => ({
    radius: getComputedStyle(el).borderRadius,
    background: getComputedStyle(el).background,
    style: el.getAttribute("style") || "",
  }));
try {
  await context.request.post(origin + "/api/auth/setup", {
    headers: { Origin: origin },
    data: { password },
  });
  await call("auth/login", { email: "giacomotanduo004@gmail.com", password });
  await page.goto(origin + "/#/");
  await page.locator('[data-design-id="home.stats.workouts"]').waitFor();
  const original = await appearance(
    page.locator('[data-design-id="home.stats.workouts"]'),
  );
  const actual = await context.newPage();
  await actual.goto(origin + "/#/");
  await actual.locator('[data-design-id="home.stats.workouts"]').waitFor();
  await page.goto(origin + "/#/design-studio");
  await waitStudio();
  await previewControl("home.stats.workouts").waitFor();
  mark("SuperAdmin deep link and real Home preview");
  const timeBefore = await appearance(previewControl("home.stats.time"));
  await number("Raggio", 24);
  await number("Altezza minima", 96);
  const color = page.getByRole("textbox", {
    name: "Sfondo del controllo HEX",
    exact: true,
  });
  await color.fill("#123456");
  await color.press("Tab");
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector(
          'gt-design-preview [data-design-id="home.stats.workouts"]',
        ),
      ).borderRadius === "24px",
  );
  assert.equal(
    (await appearance(previewControl("home.stats.workouts"))).radius,
    "24px",
  );
  assert.deepEqual(
    await appearance(previewControl("home.stats.time")),
    timeBefore,
  );
  assert.deepEqual(
    await appearance(actual.locator('[data-design-id="home.stats.workouts"]')),
    original,
  );
  mark("One-instance live style; sibling and published app unchanged");
  await page
    .getByRole("button", { name: "Testo e icone", exact: true })
    .click();
  await page
    .getByLabel("Testo visualizzato", { exact: true })
    .fill("Sessioni GT");
  await page.getByRole("button", { name: "Salva bozza", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Bozza privata salvata sul server" })
    .waitFor();
  await page.reload();
  await waitStudio();
  assert.match(
    await previewControl("home.stats.workouts").innerText(),
    /Sessioni GT/,
  );
  assert.equal(
    (await appearance(previewControl("home.stats.workouts"))).radius,
    "24px",
  );
  mark("Private draft persists after reload");
  await page
    .getByRole("button", { name: "Temi e preset", exact: true })
    .click();
  await page
    .getByLabel("Nome della copia", { exact: true })
    .fill("QA Blu personale");
  await page.getByRole("button", { name: "Salva copia", exact: true }).click();
  await page.getByText("QA Blu personale", { exact: true }).waitFor();
  mark("Custom preset saved on server");
  const draftBefore = await call("design/studio");
  const imported = {
    format: "gt-design-studio",
    schemaVersion: 1,
    config: { ...draftBefore.draft.config, global: { onClick: "alert(1)" } },
  };
  await page.locator(".studio-import input").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.getByRole("alert").filter({ hasText: "non valida" }).waitFor();
  assert.deepEqual(
    (await call("design/studio")).draft.config,
    draftBefore.draft.config,
  );
  mark("Unsafe import rejected without mutation");
  await page.getByRole("button", { name: "Pubblica", exact: true }).click();
  await confirm("Pubblica per tutti");
  await page
    .getByText("Revisione 1", { exact: true })
    .waitFor({ timeout: 20000 });
  await actual.reload();
  await actual.locator('[data-design-id="home.stats.workouts"]').waitFor();
  assert.equal(
    (await appearance(actual.locator('[data-design-id="home.stats.workouts"]')))
      .radius,
    "24px",
  );
  assert.match(
    await actual.locator('[data-design-id="home.stats.workouts"]').innerText(),
    /Sessioni GT/,
  );
  mark("Explicit publication updates real Home and survives restart");
  await actual.locator('[data-design-id="home.stats.workouts"]').click();
  await actual.waitForURL("**/#/allenamenti");
  assert.ok(actual.url().endsWith("#/allenamenti"));
  mark("Customized original workout link keeps original destination");
  for (const [path, heading] of [
    ["/piani", "Allenati"],
    ["/progressi", "Progressi"],
    ["/profilo", "Profilo"],
  ]) {
    await actual.goto(origin + "/#" + path);
    await actual
      .locator("gt-shell main")
      .getByRole("heading", { name: heading, exact: true })
      .first()
      .waitFor();
  }
  mark("Home, training, history, progress and profile navigation");
  await page.getByRole("button", { name: "Cronologia", exact: true }).click();
  await page
    .locator(".studio-history-row")
    .filter({ hasText: "Revisione 0" })
    .getByRole("button")
    .click();
  await confirm("Ripristina e pubblica");
  await page.getByText("Revisione 2", { exact: true }).waitFor();
  await actual.goto(origin + "/#/");
  await actual.reload();
  await actual.locator('[data-design-id="home.stats.workouts"]').waitFor();
  await actual.waitForFunction(
    () =>
      document
        .querySelector('[data-design-id="home.stats.workouts"]')
        .style.getPropertyValue("border-radius") === "",
  );
  assert.deepEqual(
    await appearance(actual.locator('[data-design-id="home.stats.workouts"]')),
    original,
  );
  mark("Audited rollback restores default styling exactly");
  await page
    .getByRole("button", { name: "Temi e preset", exact: true })
    .click();
  await page.locator(".studio-other-palettes > summary").click();
  const paletteButtons = page.locator(".studio-palette-legacy");
  await paletteButtons.first().waitFor();
  assert.equal(await paletteButtons.count(), 12);
  for (let i = 0; i < 12; i++) {
    await paletteButtons.nth(i).click();
    await page.locator(".studio-palette.selected").waitFor();
  }
  await paletteButtons.filter({ hasText: "Azzurro GT" }).click();
  for (const id of ["home", "training", "progress", "profile", "navigation"]) {
    await page.locator(".studio-preview-page select").selectOption(id);
    await page.locator("gt-design-preview .preview-readonly").waitFor();
    await previewControl(
      {
        home: "home.stats.workouts",
        training: "training.today",
        progress: "progress.records",
        profile: "profile.identity",
        navigation: "navigation.home",
      }[id],
    ).waitFor();
    await page.screenshot({
      path: outputDirectory + "/gt-studio-" + id + "-desktop.png",
      fullPage: true,
    });
  }
  mark("Twelve factory palettes and real previews across requested pages");
  await page
    .getByRole("button", { name: "Pagine e controlli", exact: true })
    .click();
  await page.locator(".studio-tree select").selectOption("home");
  await page.getByRole("button", { name: "Effetti", exact: true }).click();
  await page.getByLabel("Transizioni visive", { exact: true }).check();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await previewControl("home.stats.workouts").evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    ),
    "0s",
  );
  mark("Reduced motion overrides configured transitions");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page
    .getByRole("button", { name: "Mostra anteprima live", exact: true })
    .click();
  await page.locator(".studio-preview-panel").waitFor({ state: "visible" });
  await page.screenshot({
    path: outputDirectory + "/gt-studio-mobile.png",
    fullPage: true,
  });
  mark("390px mobile layout without horizontal overflow");
  // Unsaved local edits are removed; the published configuration never changes.
  await page
    .getByRole("button", { name: "Annulla", exact: true })
    .first()
    .click();
  await confirm("Scarta bozza");
  await page.getByRole("status").filter({ hasText: "Bozza rimossa" }).waitFor();
  assert.equal((await call("design/published")).revision, 2);
  mark("Cancel removes private changes and preserves publication");
  for (const role of ["Admin", "User"]) {
    const name = "qa" + role.toLowerCase();
    const created = await context.request.post(origin + "/api/users", {
      headers: { Origin: origin },
      data: {
        name: role,
        email: name + "@test.com",
        username: name,
        role,
        password,
      },
    });
    assert.ok([201, 409].includes(created.status()));
    const client = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await call("auth/login", { email: name, password }, client);
    const clientPage = await client.newPage();
    await clientPage.goto(origin + "/#/design-studio");
    await clientPage.waitForURL("**/#/profilo");
    await clientPage.locator(".profile-dashboard").waitFor();
    assert.equal(await clientPage.locator(".studio-profile-entry").count(), 0);
    assert.equal(
      (await client.request.get(origin + "/api/design/studio")).status(),
      403,
    );
    await client.close();
  }
  mark("Admin and User: hidden entry, guarded deep link, server 403");
  assert.deepEqual(errors, []);
  mark("No browser application exceptions");
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} catch (error) {
  await page.screenshot({
    path: "/tmp/gymtrack-qa-failure.png",
    fullPage: true,
  });
  console.log("APP ERRORS", errors);
  console.log("ALERT", await page.locator(".studio-error").allTextContents());
  throw error;
} finally {
  await browser.close();
}
