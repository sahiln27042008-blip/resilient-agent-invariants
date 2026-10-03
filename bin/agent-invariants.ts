#!/usr/bin/env ts-node
import { run } from "../src/cli";

process.exitCode = run(process.argv.slice(2));
