const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const endpoint = read('desktop/NavdeckDesktop/CloudEndpoint.cs');
const shell = read('desktop/NavdeckDesktop/DesktopForm.cs');
const clerk = read('desktop/NavdeckDesktop/ClerkLoginDialog.cs');
const nginx = read('deploy/oracle/nginx.conf');
const deploy = read('deploy/oracle/deploy.sh');
const docker = read('deploy/oracle/frontend.Dockerfile');

assert.match(endpoint, /https:\/\/test\.navdeck\.online/);
assert.match(shell, /CloudEndpoint\.Origin \+ "#" \+ login\.DesktopToken/);
assert.match(clerk, /FrontendOrigin = CloudEndpoint\.Origin/);
assert.match(clerk, /source\.GetLeftPart\(UriPartial\.Authority\) != FrontendOrigin/);
assert.doesNotMatch(shell, /navdeck-backend\.onrender\.com/);
assert.doesNotMatch(clerk, /navdeck-frontend\.onrender\.com/);
assert.match(docker, /REACT_APP_BACKEND_URL=""/);
assert.match(nginx, /proxy_pass http:\/\/navdeck-backend:8000/);
assert.match(nginx, /location = \/health\/ready/);
assert.match(deploy, /navdeck-mongodb/);
assert.match(deploy, /health\/ready/);
assert.match(deploy, /docker rename/);
assert.match(deploy, /rollback|restoring the previous/i);
assert.doesNotMatch(deploy, /docker (?:volume rm|system prune)/);

console.log('PASS: Oracle desktop endpoint, same-origin proxy and safe deployment checks');
