// Smoke-test the actual packaged reporting page without a browser or network.
// Prevent a phase name mismatch from silently breaking Close & Sign.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'ui', 'flight.html'), 'utf8');
const inline = source.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(inline, 'Flight UI script was not included');
const original = inline[1];
assert.ok(original.includes('init();'), 'Flight page initialization missing');

const patched = original.replace(
  /init\(\);\s*\}\)\(\);\s*$/,
  "window.__navdeckPhaseTest = key => { section=key; draw(); return d('stage').innerHTML; };\ninit();\n})();");
assert.notEqual(patched, original, 'Could not register the phase test hook');

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      value: '', hidden: false, style: {}, dataset: {},
      classList: {add(){}, remove(){}, toggle(){}},
      innerHTML: '', textContent: '', checked: false,
      getContext() {
        return {
          beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, clearRect(){},
          lineCap: '', lineWidth: 0, strokeStyle: ''
        };
      },
      setPointerCapture(){},
      getBoundingClientRect(){ return {left:0, top:0, width:640, height:130}; },
      toDataURL(){return 'data:image/png;base64,AA==';}
    });
  }
  return elements.get(id);
}

const location = {
  href: 'https://navdeck-desktop.local/flight.html?demo=1#close',
  hash: '#close'
};
const window = {
  addEventListener(){},
  navdeckDesktop: null,
  print(){},
};
const document = {
  getElementById:element,
  querySelectorAll(){return [];},
  hidden:false
};
const sandbox = {
  window, document, location, URL, Date, console,
  setInterval(){}, setTimeout(){},
  confirm(){return false;},
  crypto:require('node:crypto').webcrypto
};

vm.runInNewContext(patched, sandbox, {timeout:2500});
assert.match(element('stage').innerHTML, /Go-around review/,
  'A direct #close link did not open Close & Sign');
const phaseNames = ['briefing','departure','enroute','arrival','close'];
for (const phase of phaseNames) {
  const html = window.__navdeckPhaseTest(phase);
  assert.ok(html.length > 300, phase + ' produced an empty page');
  assert.ok(!html.includes('Reporting page error'), phase + ' failed to render');
}
const close = window.__navdeckPhaseTest('close');
assert.match(close, /Go-around review/);
assert.match(close, /Close flight/);
assert.match(close, /Sign flight report/);
assert.match(close, /Go-around 1/);
console.log('PASS: all five flight phases render, including Close & Sign and go-around review');
