/**
 * Single import that registers every production tool.
 *
 * Importing this file once at process start guarantees the tool registry is
 * fully populated before any agent runs.
 */
import './registry.js';      // base registry + Day-1 stubs (echo, db_now)
import './db-tools.js';      // db_lookup
import './draft-tools.js';   // draft_create
import './verify-metric.js'; // verify_metric
