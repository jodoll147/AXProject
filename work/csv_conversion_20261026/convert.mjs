import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';

const bundledNodeModules = 'C:/Users/yunji/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(`${bundledNodeModules}/artifact-loader.cjs`);
const artifactEntry = require.resolve('@oai/artifact-tool');
const { FileBlob, SpreadsheetFile } = await import(pathToFileURL(artifactEntry).href);

const source = 'C:/Users/yunji/Documents/ChatGPT/AI/엑셀 파일/조선_AX_목업데이터 - 복사본.xlsx';
const outputDir = 'D:/workspace/AXProject/outputs/조선_AX_목업데이터_CSV';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const order = [
  'vessels', 'zones', 'processes', 'equipment', 'blocks', 'status_codes',
  'work_orders', 'production_plan', 'production_actual', 'incidents',
  'equipment_intervals', 'work_history', 'inspections', 'rework',
  'equipment_snapshot',
];
const sheetNames = new Set(workbook.worksheets.items.map(sheet => sheet.name));
if (sheetNames.size !== order.length || order.some(name => !sheetNames.has(name))) {
  throw new Error('시트 구성이 예상한 15개 테이블과 다릅니다.');
}

const excelDate = serial => {
  const minutes = Math.round(serial * 24 * 60);
  return new Date(Date.UTC(1899, 11, 30) + minutes * 60_000).toISOString().slice(0, 16);
};
const cellText = (value, header) => {
  if (value == null) return '';
  if (typeof value === 'number' && (header.endsWith('_at') || header === 'plan_date' || header === 'as_of')) {
    const local = excelDate(value);
    return header === 'plan_date' ? local.slice(0, 10) : `${local}:00+09:00`;
  }
  return String(value);
};
const escapeCsv = value => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

await fs.mkdir(outputDir, { recursive: true });
for (const [index, name] of order.entries()) {
  const sheet = workbook.worksheets.getItem(name);
  const rows = sheet.getUsedRange().values;
  const headers = rows[0].map(value => String(value ?? '').trim());
  if (headers.some(value => !value) || new Set(headers).size !== headers.length) {
    throw new Error(`${name} 시트의 헤더가 비었거나 중복되었습니다.`);
  }
  const csv = '\uFEFF' + rows.map((row, rowIndex) => row.map((value, column) =>
    escapeCsv(rowIndex === 0 ? headers[column] : cellText(value, headers[column]))
  ).join(',')).join('\r\n') + '\r\n';
  const filename = `${String(index + 1).padStart(2, '0')}_${name}.csv`;
  await fs.writeFile(`${outputDir}/${filename}`, csv, 'utf8');
  console.log(`${filename}: ${rows.length - 1} data rows`);
}
