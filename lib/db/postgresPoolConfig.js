"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePostgresPoolConfig = resolvePostgresPoolConfig;
var node_fs_1 = require("node:fs");
var resolveDatabaseUrl_1 = require("./resolveDatabaseUrl");
function parseDatabaseUrl(connectionString) {
    return new URL(connectionString.replace(/^postgres(ql)?:\/\//, 'https://'));
}
function sslModeRequiresTls(sslmode) {
    if (!sslmode)
        return false;
    var mode = sslmode.toLowerCase();
    return mode !== 'disable' && mode !== 'allow';
}
function poolConfigFromUrl(connectionString) {
    var url = parseDatabaseUrl(connectionString);
    var database = url.pathname.replace(/^\//, '');
    return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 5432,
        user: decodeURIComponent(url.username),
        password: url.password ? decodeURIComponent(url.password) : undefined,
        database: database || undefined,
    };
}
function resolvePoolMax() {
    var _a;
    var fromEnv = (_a = process.env.DATABASE_POOL_MAX) === null || _a === void 0 ? void 0 : _a.trim();
    if (fromEnv) {
        var parsed = Number(fromEnv);
        if (Number.isFinite(parsed) && parsed > 0)
            return Math.floor(parsed);
    }
    // Hosted Postgres (e.g. Aiven) has low max_connections. Each Node process (dev
    // server, Vercel lambda, script) gets its own pool — keep defaults tiny.
    if (process.env.VERCEL)
        return 1;
    return process.env.NODE_ENV === 'development' ? 2 : 1;
}
var POOL_IDLE_TIMEOUT_MS = 10000;
var POOL_CONNECT_TIMEOUT_MS = 10000;
function withPoolTimeouts(config) {
    return __assign(__assign({}, config), { idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS, connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS, allowExitOnIdle: true });
}
/**
 * Pool config for @prisma/adapter-pg. Prisma Migrate uses its own TLS stack; the pg
 * driver needs explicit `ssl` when connecting to managed Postgres (e.g. Aiven).
 *
 * `sslmode` in the URL is not passed through: pg v8+ maps require/verify-ca to
 * verify-full, which breaks Aiven on Windows without the provider CA in trust store.
 */
function resolvePostgresPoolConfig(connectionString) {
    var _a, _b;
    var max = resolvePoolMax();
    var normalized = (0, resolveDatabaseUrl_1.normalizePostgresUrl)(connectionString);
    var url = parseDatabaseUrl(normalized);
    var sslmode = url.searchParams.get('sslmode');
    var isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    var caEnv = (_a = process.env.DATABASE_SSL_CA) === null || _a === void 0 ? void 0 : _a.trim();
    var rejectUnauthorizedEnv = (_b = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED) === null || _b === void 0 ? void 0 : _b.trim().toLowerCase();
    var wantsTls = sslModeRequiresTls(sslmode) ||
        Boolean(caEnv) ||
        rejectUnauthorizedEnv === 'true' ||
        rejectUnauthorizedEnv === 'false';
    if (!wantsTls || (isLocalHost && !sslModeRequiresTls(sslmode) && !caEnv)) {
        return withPoolTimeouts({ connectionString: normalized, max: max });
    }
    var config = poolConfigFromUrl(normalized);
    config.max = max;
    if (caEnv) {
        var ca = caEnv.includes('-----BEGIN') ? caEnv : (0, node_fs_1.readFileSync)(caEnv, 'utf8');
        config.ssl = { ca: ca, rejectUnauthorized: rejectUnauthorizedEnv !== 'false' };
        return withPoolTimeouts(config);
    }
    config.ssl = { rejectUnauthorized: rejectUnauthorizedEnv === 'true' };
    return withPoolTimeouts(config);
}
