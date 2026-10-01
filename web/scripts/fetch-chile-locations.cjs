// Read-only importer. Source: BCN SIIT regional directories.
const { JSDOM } = require('jsdom');

async function main() {
  const regionCodes = [15, 1, 2, 3, 4, 5, 13, 6, 7, 16, 8, 9, 14, 10, 11, 12];
  const regions = [];
  for (const code of regionCodes) {
    const source = `https://www.bcn.cl/siit/nuestropais/region${code}`;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`${source}: ${response.status}`);
    const document = new JSDOM(await response.text()).window.document;
    const name = document.querySelector('h1')?.textContent.trim();
    const communes = [...document.querySelectorAll('a.list-group-item[href*="idcom="]')].map(
      (link) => link.textContent.trim(),
    );
    if (!name || !communes.length) throw new Error(`Missing regional data: ${source}`);
    regions.push({
      code: String(code).padStart(2, '0'),
      name,
      communes: communes.sort((a, b) => a.localeCompare(b, 'es')),
    });
  }
  const names = regions.flatMap((region) => region.communes);
  if (names.length !== 346 || new Set(names).size !== 346)
    throw new Error('Unexpected commune coverage');
  process.stdout.write(JSON.stringify(regions));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
