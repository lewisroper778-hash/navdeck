const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'ui', 'touchdown.html'), 'utf8');
const desktop = fs.readFileSync(path.join(__dirname, '..', 'NavdeckDesktop', 'DesktopForm.cs'), 'utf8');
const frontend = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'DesktopConnectPage.jsx'), 'utf8');
const login = fs.readFileSync(path.join(__dirname, '..', 'NavdeckDesktop', 'ClerkLoginDialog.cs'), 'utf8');
const start = fs.readFileSync(path.join(__dirname, '..', 'NavdeckDesktop', 'SimulatorAutostart.cs'), 'utf8');

assert.match(desktop,/AddNavigation\("Touchdown Plotter"/);
assert.match(desktop,/getTouchdown: \(\) => request\('getTouchdown'\)/);
assert.match(desktop,/getSession: \(\) => request\('getSession'\)/);
assert.match(desktop,/signIn: \(\) => request\('signIn'\)/);
assert.match(frontend,/getToken\(\)/);
assert.match(frontend,/\/api\/bridge\/link/);
assert.match(frontend,/navdeck:clerk-connected/);
assert.match(login,/source\.AbsolutePath != HandoffPath/);
assert.match(start,/--watch-sim/);

const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'Touchdown script not found');
const elements = new Map();
const get = id => {
  if (!elements.has(id)) {
    const attrs = {};
    const classes = new Set();
    elements.set(id, {
      textContent:'', attrs, nextElementSibling:{textContent:''},
      classList:{toggle:(name,enabled)=>enabled?classes.add(name):classes.delete(name),
        contains:name=>classes.has(name)},
      setAttribute:(name,value)=>{attrs[name]=value;},
    });
  }
  return elements.get(id);
};
const sample = {
  connected:true,aircraft:'A320',
  touchdown:{
    time_utc:'2026-11-16T03:40:00Z',
    airport:'EGLL',runway:'27L',
    distance_from_threshold_m:300,offset_from_centreline_m:8,
    runway_length_m:3658,runway_width_m:45,landing_rate_fpm:156
  }
};
let current = sample;
const sandbox = {
  document:{getElementById:get,hidden:false},
  window:{navdeckDesktop:{getTouchdown:async()=>current}},
  setInterval(){},console,Date,Math,Number
};
vm.runInNewContext(match[1],sandbox,{timeout:3000});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  await tick();await tick();
  assert.equal(get('rate').textContent,'156');
  assert.equal(get('runway').textContent,'27L');
  assert.equal(get('airport').textContent,'EGLL');
  assert.equal(get('touchdownMarker').attrs.visibility,'visible');
  assert.match(get('touchdownMarker').attrs.transform,/^translate\(/);
  assert.equal(get('status').classList.contains('connected'),true);
  assert.match(get('landingTitle').textContent,/27L/);

  current={connected:false,touchdown:null};
  await sandbox.update();await tick();
  assert.equal(get('status').classList.contains('connected'),false);
  console.log('PASS: Touchdown sidebar, runway plot, Clerk handoff and simulator watcher');
})().catch(error=>{console.error(error);process.exitCode=1;});
