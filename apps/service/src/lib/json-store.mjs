import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureJsonFile(filePath, seedValue) {
  try {
    await readFile(filePath, 'utf8');
  }
  catch {
    await mkdir(dirname(filePath), { recursive: true });
    await writeJson(filePath, seedValue);
  }
}

export async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
