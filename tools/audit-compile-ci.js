#!/usr/bin/env node
'use strict';
// Outputs only a synthetic plan to a CI subprocess, never a user's snapshot.
const {compile}=require('../windows/audit/compile-safe'),{fixture}=require('./audit-safe-fixture');
const {snapshot,mapping}=fixture(),result=compile(snapshot,mapping);
if(!result.ok)throw Error('Synthetic fixture was rejected');
process.stdout.write(JSON.stringify({commands:result.commands,checks:result.checks}));
