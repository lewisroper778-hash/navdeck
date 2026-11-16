// Smoke-test the real packaged desktop workspace's import and account controls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'ui', 'workspace.html'), 'utf8');
const desktop = fs.readFileSync(path.join(__dirname, '..', 'NavdeckDesktop', 'DesktopForm.cs'), 'utf8');
const reporting = fs.readFileSync(path.join(__dirname, '..', 'ui', 'flight.html'), 'utf8');
assert.doesNotMatch(desktop, /AddNavigation\("Preview Reporting"/);
assert.doesNotMatch(html, /previewOFP|Preview sample reporting/);
assert.doesNotMatch(reporting, /id="sampleFlight"|id="demoReport"/);

const script = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script, 'Workspace script missing');

function createWorkspace({paired = true, flightId = '1b2f7b1b-1b2f-4c31-93cb-b94f1b87be11'} = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id, value:'', textContent:'', innerHTML:'', disabled:false,
        className:'', style:{}, dataset:{}, onclick:null, onsubmit:null,
        querySelector(){return {textContent:''};},
        querySelectorAll(){return [];},
        insertAdjacentHTML(){},
      });
    }
    return elements.get(id);
  }
  const handlers = {};
  const location = {
    hash:'#settings', href:'https://navdeck-desktop.local/workspace.html#settings',
    reloadCount:0, reload(){this.reloadCount++;}
  };
  const calls = [];
  let confirmResult = true;
  const api = {
    getSession:async()=>({paired}),
    getFlight:async()=>({flight:null}),
    getProfile:async()=>({profile:{simbrief_pilot_id:'12345'}}),
    importSimbrief:async(payload)=>{calls.push({name:'import',payload});return {flight:{id:flightId,callsign:'BAW304'}};},
    signOut:async()=>{calls.push({name:'signout'});paired=false;return {signed_out:true};}
  };
  const window = {navdeckDesktop:api,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const document = {getElementById:element};
  const sandbox = {window,document,location,URLSearchParams,URL,Date,console,
    confirm:()=>confirmResult,setInterval(){},setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(script[1],sandbox,{timeout:3000});
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  const settle=async()=>{await tick();await tick();await tick();};
  return {element,location,calls,handlers,settle,
    setConfirm:value=>{confirmResult=value;},
    setPage:async page=>{location.hash='#'+page;handlers.hashchange();await settle();}
  };
}

(async()=>{
  const signedIn=createWorkspace();
  await signedIn.settle();
  assert.match(signedIn.element('content').innerHTML,/id="accountPanel"/);
  assert.match(signedIn.element('accountActions').innerHTML,/Sign out of NAVDECK/);
  assert.equal(typeof signedIn.element('signOutAccount').onclick,'function');

  signedIn.setConfirm(false);
  await signedIn.element('signOutAccount').onclick();
  assert.equal(signedIn.calls.length,0,'Cancelled signout must not call native bridge');

  signedIn.setConfirm(true);
  await signedIn.element('signOutAccount').onclick();
  assert.deepEqual(signedIn.calls.map(x=>x.name),['signout']);
  assert.equal(signedIn.location.reloadCount,1,'Signout must clear in-memory UI by reloading');

  const imported=createWorkspace();
  await imported.setPage('simbrief');
  assert.doesNotMatch(imported.element('content').innerHTML,/Preview sample reporting/);
  imported.element('pilotId').value='12345';
  assert.equal(typeof imported.element('importOFP').onclick,'function');
  await imported.element('importOFP').onclick();
  assert.deepEqual(imported.calls.map(x=>x.name),['import']);
  assert.match(imported.location.href,/^flight\.html\?id=1b2f7b1b-1b2f-4c31-93cb-b94f1b87be11#enroute$/);

  const signedOut=createWorkspace({paired:false});
  await signedOut.settle();
  assert.match(signedOut.element('accountActions').innerHTML,/Sign in with Clerk/);
  assert.equal(typeof signedOut.element('signInAccount').onclick,'function');
  assert.doesNotMatch(signedOut.element('accountActions').innerHTML,/id="signOutAccount"/);

  const badImport=createWorkspace({flightId:''});
  await badImport.setPage('simbrief');
  badImport.element('pilotId').value='12345';
  await badImport.element('importOFP').onclick();
  assert.match(badImport.element('profileNotice').innerHTML,/Imported flight ID was missing/);
  assert.ok(!badImport.location.href.startsWith('flight.html'),
    'Missing imported ID must not open a different active flight');
  console.log('PASS: no preview links, imported OFP opens exact report, signout and signed-out state work');
})().catch(err=>{console.error(err);process.exitCode=1;});
