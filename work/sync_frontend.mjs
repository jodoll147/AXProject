import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Keep the live screen visually in sync with the final standalone design.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const template = readFileSync(resolve(root, 'work/screen_template.html'), 'utf8').replaceAll('\r\n', '\n')
const source = 'const D=/*__DATA__*/null;\nconst SPEC=D._spec;delete D._spec;\nconst VALIDATION_DATA=D;'
if (!template.includes(source)) throw new Error('Data placeholder not found in design template')

const dataLoader = `;(async () => {
const [dataResponse, specResponse, statusResponse] = await Promise.all([fetch('/api/data'), fetch('/api/spec'), fetch('/api/data/status')]);
if (!dataResponse.ok || !specResponse.ok || !statusResponse.ok) throw new Error('데이터 API 응답을 확인하세요.');
const loadedData = await dataResponse.json();
const SPEC = await specResponse.json();
const DATA_STATUS = await statusResponse.json();
const VALIDATION_DATA = loadedData;
const D = DATA_STATUS.ready ? loadedData : Object.fromEntries(Object.keys(loadedData).map(table => [table, []]));`
const errorHandler = `})().catch(error => {
  console.error(error);
  document.querySelector('.view').innerHTML = '<div class="empty">데이터를 불러오지 못했습니다. 백엔드 서버를 확인하고 새로고침하세요.</div>';
});
</script>`
const html = template.replace(source, dataLoader).replace('</script>', errorHandler)
const target = resolve(root, 'app/frontend/index.html')
writeFileSync(target, html)
console.log(`Updated ${target}`)
