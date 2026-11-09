import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// iOS installation can fetch icons without the page's authentication cookie.
// Safari 26+ supports data URL icons: ship only the public brand image bytes,
// never a service token or a URL that weakens the Site's private access policy.
export async function embedInstallIcons(root) {
  const directory = path.resolve(root);
  const png = async (relative) => {
    const file = path.resolve(directory, relative);
    if (!file.startsWith(directory + path.sep))
      throw Error("Icon outside the build");
    const bytes = await readFile(file);
    if (bytes.subarray(1, 4).toString() !== "PNG")
      throw Error("Install icon must be PNG");
    return "data:image/png;base64," + bytes.toString("base64");
  };
  const touch = await png("icons/gt-modern-180.png"),
    favicon = await png("icons/gt-modern-192.png");
  const index = path.join(directory, "index.html");
  let html = await readFile(index, "utf8");
  for (const [rel, data] of [
    ["apple-touch-icon", touch],
    ["apple-touch-icon-precomposed", touch],
    ["icon", favicon],
  ]) {
    const tag = new RegExp('<link\\b(?=[^>]*\\brel="' + rel + '")[^>]*>', "g");
    let count = 0;
    html = html.replace(tag, (current) => {
      count++;
      return current.replace(/\bhref="[^"]*"/, 'href="' + data + '"');
    });
    if (count !== 1)
      throw Error("Install icon link missing or ambiguous: " + rel);
  }
  await writeFile(index, html);
  const source = JSON.parse(
    await readFile("public/manifest.webmanifest", "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.webmanifest"), "utf8"),
  );
  manifest.icons = await Promise.all(
    source.icons.map(async (icon) => ({ ...icon, src: await png(icon.src) })),
  );
  await writeFile(
    path.join(directory, "manifest.webmanifest"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
