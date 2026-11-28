/* Runs the Metal Cycle engine straight from the ORIGINAL page text (reference/index.original.html), so the build uses
   exactly the page's own MetalEngine.build (the JS port of claude/metalcycle/engine.py that the page's own Refresh runs).
   Nothing is copied: the script block is taken out of the page and run as it is.
   usage: require('./page_engine.js').load(pageText) -> { build(name, bars{t,o,h,l,c}, nowMs) } */
'use strict';
const vm = require('vm');

function load(pageText) {
  const blocks = pageText.split('<script>').slice(1).map((b) => b.split('</script>')[0]);
  const eng = blocks.filter((b) => b.includes('Metal Cycle engine') && b.includes('module.exports = api'));
  if (eng.length !== 1) throw new Error('the page should hold exactly one Metal Cycle engine script, found ' + eng.length);
  const module = { exports: {} };
  vm.runInNewContext(eng[0], { module, globalThis: {}, Math, Number, String, Array, Object, Date, Map, Set, JSON, Infinity, NaN, isFinite });
  if (typeof module.exports.build !== 'function') throw new Error('the engine did not export build()');
  return module.exports;
}
module.exports = { load };
