"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAccelerateOrPrismaProxyUrl = isAccelerateOrPrismaProxyUrl;
exports.normalizePostgresUrl = normalizePostgresUrl;
exports.resolveDatabaseUrlForScripts = resolveDatabaseUrlForScripts;
var ACCELERATE_HOST = 'accelerate.prisma-data.net';
function isAccelerateOrPrismaProxyUrl(url) {
    return (url.startsWith('prisma+postgres://') ||
        url.startsWith('prisma://') ||
        url.includes(ACCELERATE_HOST));
}
/** Normalizes `postgres://` to `postgresql://` for node-pg / PrismaPg. */
function normalizePostgresUrl(url) {
    if (url.startsWith('postgres://')) {
        return "postgresql://".concat(url.slice('postgres://'.length));
    }
    return url;
}
function readDirectUrl() {
    var _a, _b;
    return ((_a = process.env.DIRECT_DATABASE_URL) === null || _a === void 0 ? void 0 : _a.trim()) || ((_b = process.env.DIRECT_URL) === null || _b === void 0 ? void 0 : _b.trim()) || undefined;
}
/**
 * Direct TCP URL for migrations, seed, and other long-running DB scripts.
 * Prefer DIRECT_DATABASE_URL; never use Prisma Accelerate for these workloads.
 */
function resolveDatabaseUrlForScripts(script) {
    var _a;
    var direct = readDirectUrl();
    var databaseUrl = (_a = process.env.DATABASE_URL) === null || _a === void 0 ? void 0 : _a.trim();
    var chosen = direct !== null && direct !== void 0 ? direct : databaseUrl;
    if (!chosen) {
        throw new Error('DATABASE_URL is not set.');
    }
    if (!direct && isAccelerateOrPrismaProxyUrl(chosen)) {
        throw new Error("Cannot run ".concat(script, " through Prisma Accelerate (timeouts on bulk writes). ") +
            'Set DIRECT_DATABASE_URL to your direct PostgreSQL URL ' +
            '(Prisma Data Platform → Connect → Direct TCP, or local postgresql://…). ' +
            'Keep DATABASE_URL as the Accelerate URL for the Next.js app.');
    }
    if (isAccelerateOrPrismaProxyUrl(chosen)) {
        throw new Error('DIRECT_DATABASE_URL must be a direct postgresql:// or postgres:// URL, not Prisma Accelerate.');
    }
    return normalizePostgresUrl(chosen);
}
