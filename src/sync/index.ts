// Pure sync layer (SYNC.md): flatten a project to addressable nodes, merge two
// flat lists per-node, rebuild the live tree. No network/backend here — this is
// the local foundation a future server plugs into (flatten -> push changed
// nodes; pull -> merge -> rebuild).

export { flatten, rebuild, type SyncNode } from './flatten';
export { merge, unionHistory } from './merge';
export { mergeProjects, mergeStatuses, fingerprint } from './project';
export { keyBetween, initialKeys } from '../model/orderKey';
