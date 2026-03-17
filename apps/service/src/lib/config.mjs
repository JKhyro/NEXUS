import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const serviceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(serviceDir, '..', '..', '..', '..');

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }

  return [];
}

function loadLocalConfig(configPath) {
  if (!configPath || !existsSync(configPath)) {
    return {};
  }

  return JSON.parse(readFileSync(configPath, 'utf8'));
}

export function resolveServiceConfig(overrides = {}) {
  const configPath = overrides.configPath ?? process.env.NEXUS_CONFIG_PATH ?? join(repoRoot, 'config', 'nexus.local.json');
  const localConfig = loadLocalConfig(configPath);

  const deploymentMode = overrides.deploymentMode ?? process.env.NEXUS_DEPLOYMENT_MODE ?? localConfig.deploymentMode ?? 'local-managed';
  const host = overrides.host ?? process.env.NEXUS_HOST ?? localConfig.host ?? (deploymentMode === 'hosted' ? '0.0.0.0' : '127.0.0.1');
  const port = Number(overrides.port ?? process.env.NEXUS_PORT ?? localConfig.port ?? 43100);
  const dataDir = overrides.dataDir ?? process.env.NEXUS_DATA_DIR ?? localConfig.dataDir ?? join(repoRoot, 'runtime');
  const bootstrapPath = overrides.bootstrapPath ?? localConfig.bootstrapPath ?? join(repoRoot, 'config', 'internal-bootstrap.json');
  const staticDir = overrides.staticDir ?? localConfig.staticDir ?? join(repoRoot, 'apps', 'web', 'public');
  const staticMode = overrides.staticMode ?? process.env.NEXUS_STATIC_MODE ?? localConfig.staticMode ?? 'embedded';
  const publicOrigin = overrides.publicOrigin ?? process.env.NEXUS_PUBLIC_ORIGIN ?? localConfig.publicOrigin ?? '';
  const allowedOrigins = normalizeArray(overrides.allowedOrigins ?? process.env.NEXUS_ALLOWED_ORIGINS ?? localConfig.allowedOrigins ?? []);
  const storageMode = overrides.storageMode ?? process.env.NEXUS_STORAGE_MODE ?? localConfig.storageMode ?? 'json';
  const libraryConnectionString = overrides.libraryConnectionString ?? process.env.NEXUS_LIBRARY_CONNECTION_STRING ?? localConfig.libraryConnectionString ?? '';
  const libraryChatbaseSchema = overrides.libraryChatbaseSchema ?? process.env.NEXUS_LIBRARY_CHATBASE_SCHEMA ?? localConfig.libraryChatbaseSchema ?? 'nexus_chatbase';
  const libraryMetabaseSchema = overrides.libraryMetabaseSchema ?? process.env.NEXUS_LIBRARY_METABASE_SCHEMA ?? localConfig.libraryMetabaseSchema ?? 'nexus_metabase';

  return {
    repoRoot,
    configPath,
    deploymentMode,
    host,
    port,
    dataDir,
    bootstrapPath,
    staticDir,
    staticMode,
    publicOrigin,
    allowedOrigins,
    storageMode,
    libraryConnectionString,
    libraryChatbaseSchema,
    libraryMetabaseSchema
  };
}
