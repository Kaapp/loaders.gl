// loaders.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import * as wasmNode from 'parquet-wasm/node/arrow1';

export async function loadWasm(wasmUrl?: string) {
  return wasmNode;
}
