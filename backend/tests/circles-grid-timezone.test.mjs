import test from 'node:test';import assert from 'node:assert/strict';
import {programmeMonth} from '../src/academy/d1/web-platform/studio-monthly-grid.mjs';
test('monthly register uses the programme timezone at a calendar boundary',()=>{
 const now=Date.parse('2026-10-31T23:30:00Z');assert.equal(programmeMonth('Africa/Johannesburg',now),'2026-11');assert.equal(programmeMonth('America/New_York',now),'2026-10');assert.equal(programmeMonth('UTC',now),'2026-10');
});
