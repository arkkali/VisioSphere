/**
 * facilityScope.js — tenant isolation as a Mongoose plugin.
 *
 * WHY A PLUGIN AND NOT PER-QUERY FILTERS
 * The backend has ~100 query sites across 18 services, plus 17 endpoints that
 * resolve a client-supplied id with no ownership check. Adding `facility` to
 * each filter by hand is fail-OPEN: every site missed keeps leaking silently,
 * and every new query written later starts unscoped. This plugin makes the
 * facility predicate automatic, so isolation is the default and leaking
 * requires an explicit, greppable opt-out.
 *
 * HOW IT WORKS
 * `verifyToken` (middleware/auth.js) reads the facility out of the caller's
 * JWT and runs the rest of the request inside an AsyncLocalStorage context.
 * Every read, write and aggregate on a plugged-in model then picks that
 * facility up automatically:
 *
 *   find / findOne / count / distinct / update* / delete*  → .where({ facility })
 *   aggregate                                              → $match unshifted
 *   save / insertMany                                      → facility stamped on
 *
 * ESCAPE HATCHES (both deliberately loud and greppable)
 *   runUnscoped(fn)            — cross-tenant by design. Login must find the
 *                                account before it can know the facility;
 *                                background jobs run outside any request.
 *   runWithFacility(key, fn)   — act as one specific facility, e.g. the CCTV
 *                                socket handler resolving camera → facility.
 *
 * STRICT MODE
 * With no context at all, a query is ambiguous — we cannot tell a legitimate
 * background job from a request that slipped past the middleware. Strict mode
 * (default ON) throws rather than silently returning both facilities' data.
 * Set FACILITY_SCOPE_STRICT=false to downgrade to a warning while migrating,
 * but understand that is fail-open: unscoped reads will return everything.
 */

const { AsyncLocalStorage } = require('node:async_hooks');
const { FACILITY_KEYS, isFacility } = require('../../config/facilities');

const storage = new AsyncLocalStorage();

const STRICT = process.env.FACILITY_SCOPE_STRICT !== 'false';

/** Query-only operations — no document middleware of the same name exists. */
const QUERY_OPS = [
  'count',
  'countDocuments',
  'deleteMany',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'update',
  'updateMany',
];

/**
 * Ambiguous names: Mongoose registers `deleteOne`, `updateOne` and
 * `replaceOne` as DOCUMENT middleware by default, where `this` is a document
 * with no .where(). Without { document: false, query: true } the hook either
 * no-ops or throws on the document form — and the query form never gets
 * scoped, which is a silent tenancy leak on every delete/update-by-filter.
 */
const AMBIGUOUS_OPS = ['deleteOne', 'updateOne', 'replaceOne'];

const QUERY_MIDDLEWARE = { document: false, query: true };
// estimatedDocumentCount is intentionally absent: it takes no filter and
// cannot be scoped. Do not use it on a tenant-owned model.

const getContext = () => storage.getStore();

/**
 * Run `fn` inside `store`, making sure a lazily-executed return value is
 * resolved WHILE the context is still active.
 *
 * This matters because a Mongoose Query is lazy. Given:
 *
 *     const q = runUnscoped(() => Admin.findOne({ email }));
 *     await q;
 *
 * the query is *built* inside the context but not executed; storage.run()
 * returns it unexecuted, and the caller's await fires exec() after the context
 * has already been torn down — so the scoping hooks see nothing and (correctly)
 * fail closed. Calling .then() synchronously here starts execution while we are
 * still inside run(), so the hooks observe the intended context.
 *
 * Callers should still prefer `async () => { await ... }`, which is explicit;
 * this makes the terser `() => Model.find(...)` form safe rather than silently
 * wrong.
 */
const runInContext = (store, fn) =>
  storage.run(store, () => {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return new Promise((resolve, reject) => result.then(resolve, reject));
    }
    return result;
  });

/** Run `fn` scoped to one facility. */
const runWithFacility = (facility, fn) => {
  if (!isFacility(facility)) {
    throw new Error(
      `[facilityScope] "${facility}" is not a known facility. Expected one of: ${FACILITY_KEYS.join(', ')}`
    );
  }
  return runInContext({ facility, unscoped: false }, fn);
};

/**
 * Run `fn` across ALL facilities. Every call site is a deliberate decision to
 * cross the tenant boundary — keep them few and keep them auditable.
 */
const runUnscoped = (fn) => runInContext({ facility: null, unscoped: true }, fn);

const currentFacility = () => {
  const ctx = getContext();
  return ctx && !ctx.unscoped ? ctx.facility : null;
};

/** Resolve the facility to apply, or null to leave the operation untouched. */
const resolveScope = (opName, modelName) => {
  const ctx = getContext();

  if (ctx?.unscoped) return null;
  if (ctx?.facility) return ctx.facility;

  const message =
    `[facilityScope] ${modelName}.${opName}() ran with no facility context. ` +
    `Wrap it in runWithFacility() or, if crossing tenants is intended, runUnscoped().`;

  if (STRICT) throw new Error(message);
  console.warn(`${message} (FACILITY_SCOPE_STRICT=false — returning data from ALL facilities)`);
  return null;
};

/**
 * @param {import('mongoose').Schema} schema
 * @param {{ required?: boolean }} [options]
 */
module.exports = function facilityScope(schema, options = {}) {
  const { required = true } = options;

  schema.add({
    facility: {
      type: String,
      enum: FACILITY_KEYS,
      required,
      index: true,
    },
  });

  /* ── reads / filtered writes ─────────────────────────────────────────── */
  const scopeQuery = (op) => function () {
    const modelName = this.model?.modelName || 'Model';

    // An explicit facility in the query wins — that is how a caller says
    // "I know what I'm doing" without disabling scoping globally.
    if (typeof this.getQuery === 'function' && this.getQuery().facility !== undefined) return;

    const facility = resolveScope(op, modelName);
    if (facility) this.where({ facility });
  };

  QUERY_OPS.forEach((op) => schema.pre(op, scopeQuery(op)));
  AMBIGUOUS_OPS.forEach((op) => schema.pre(op, QUERY_MIDDLEWARE, scopeQuery(op)));

  /* ── aggregation: facility must land in the FIRST stage ──────────────── */
  schema.pre('aggregate', function () {
    const modelName = this._model?.modelName || 'Model';
    const facility = resolveScope('aggregate', modelName);
    if (facility) this.pipeline().unshift({ $match: { facility } });
  });

  /* ── creates ─────────────────────────────────────────────────────────────
     Mongoose 9 dropped the callback style for document middleware:
       pre('save')       is invoked with NO arguments
       pre('insertMany') is invoked with just (docs)
     Mongoose 6/7 passed `next` first in both cases. These hooks detect which
     convention is in play instead of assuming, so the plugin keeps working
     across an upgrade in either direction. Calling next() unconditionally is
     what produced "next is not a function" on every document create.
     ─────────────────────────────────────────────────────────────────────── */
  schema.pre('save', function (...args) {
    const next = typeof args[0] === 'function' ? args[0] : null;

    if (!this.facility) {
      const ctx = getContext();
      if (ctx && !ctx.unscoped && ctx.facility) this.facility = ctx.facility;
    }

    if (next) return next();
  });

  schema.pre('insertMany', function (...args) {
    const next = typeof args[0] === 'function' ? args[0] : null;
    const docs = next ? args[1] : args[0];

    const ctx = getContext();
    if (ctx && !ctx.unscoped && ctx.facility && Array.isArray(docs)) {
      docs.forEach((d) => { if (d && !d.facility) d.facility = ctx.facility; });
    }

    if (next) return next();
  });

  /* ── upserts: the filter is scoped above, but $set needs the value too,
        otherwise an inserted doc has no facility and fails validation ──── */
  const stampUpsert = function () {
    const ctx = getContext();
    if (!ctx || ctx.unscoped || !ctx.facility) return;
    if (!this.getOptions().upsert) return;

    const update = this.getUpdate() || {};
    if (Array.isArray(update)) return; // aggregation-pipeline update
    update.$setOnInsert = { ...(update.$setOnInsert || {}), facility: ctx.facility };
    this.setUpdate(update);
  };

  schema.pre(['findOneAndUpdate', 'updateMany'], stampUpsert);
  schema.pre('updateOne', QUERY_MIDDLEWARE, stampUpsert);
};

module.exports.runWithFacility = runWithFacility;
module.exports.runUnscoped = runUnscoped;
module.exports.currentFacility = currentFacility;
module.exports.storage = storage;
module.exports.STRICT = STRICT;
