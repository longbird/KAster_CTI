import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  sourceRecordsToDrafts,
  mergeHelpEntries,
  parseScreenFilename,
  screenFilesToDrafts,
  validateHelpEntry,
  type HelpSourceRecord,
  type ScreenFile,
} from './buildHelp';
import type { FeatureHelpData } from '../src/shared/help/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '../../..');
const REF_DIR = resolve(REPO_ROOT, 'docs/IPPBX_개발시 참조용_20260104');
const SCREEN_DIR = resolve(REF_DIR, '3_DM_설정화면');
const CURATED_PATH = resolve(__dirname, 'help-curated.json');
const SOURCE_MAP_PATH = resolve(__dirname, 'help-source-map.json');
const OUT_PATH = resolve(__dirname, '../src/shared/help/pbxFeatureHelp.generated.json');

function loadCurated(): FeatureHelpData {
  return JSON.parse(readFileSync(CURATED_PATH, 'utf8')) as FeatureHelpData;
}

function loadSourceRecords(): HelpSourceRecord[] {
  try {
    return JSON.parse(readFileSync(SOURCE_MAP_PATH, 'utf8')) as HelpSourceRecord[];
  } catch {
    console.warn(`[help:build] 원천 매핑 파일을 읽지 못함: ${SOURCE_MAP_PATH}`);
    return [];
  }
}

function loadScreenFiles(): ScreenFile[] {
  let names: string[];
  try {
    names = readdirSync(SCREEN_DIR);
  } catch {
    console.warn(`[help:build] 설정화면 디렉터리를 읽지 못함: ${SCREEN_DIR}`);
    return [];
  }
  return names
    .map(parseScreenFilename)
    .filter((file): file is ScreenFile => file !== null);
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const curated = loadCurated();
  const sourceRecords = loadSourceRecords();
  console.log(`[help:build] 원천 매핑 ${sourceRecords.length}건에서 초안 추출`);

  const screenFiles = loadScreenFiles();
  console.log(`[help:build] 설정화면 ${screenFiles.length}건에서 초안 추출`);
  const drafts = mergeHelpEntries(
    sourceRecordsToDrafts(sourceRecords, today),
    screenFilesToDrafts(screenFiles, today),
  );

  const merged = mergeHelpEntries(curated, drafts);

  let fatal = 0;
  for (const entry of Object.values(merged)) {
    const errors = validateHelpEntry(entry);
    if (errors.length === 0) continue;
    if (entry.reviewStatus === 'APPROVED') {
      fatal += errors.length;
      console.error(`[help:build] FATAL ${entry.featureKey}: ${errors.join('; ')}`);
    } else {
      console.warn(`[help:build] WARN ${entry.featureKey}: ${errors.join('; ')}`);
    }
  }
  if (fatal > 0) {
    console.error(`[help:build] APPROVED 항목 검증 오류 ${fatal}건 - 중단`);
    process.exit(1);
  }

  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  console.log(`[help:build] ${Object.keys(sorted).length}개 항목 작성: ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
