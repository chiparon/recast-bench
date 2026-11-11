const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runCli(args, opts = {}) {
  const cli = path.resolve('bin/cli.js');
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
  });
}

function clean(s) {
  return (s || '').replace(/\r\n/g, '\n').trim();
}

suite('cli extra suite', function () {
  test('cli renders to output-file with -o flag', function () {
    const outPath = path.resolve('test/fixtures/tmp_output.html');
    try {
      const res = runCli(['-o', outPath, '-m', '$', 'test/fixtures/user.ejs', 'name=alice']);
      assert.strictEqual(res.status, 0);
      assert.strictEqual(fs.existsSync(outPath), true);
      assert.strictEqual(clean(fs.readFileSync(outPath, 'utf8')), '<h1>alice</h1>');
    } finally {
      try { fs.unlinkSync(outPath); } catch {}
    }
  });

  test('cli prints usage on -h flag', function () {
    const res = runCli(['-h']);
    assert.strictEqual(res.status, 0);
    assert.ok(clean(res.stdout).includes('Usage'));
  });

  test('cli exits cleanly on -v flag', function () {
    const res = runCli(['-v']);
    assert.strictEqual(res.status, 0);
  });

  test('cli renders with custom open/close delimiter -p and -c', function () {
    const tplPath = path.resolve('test/fixtures/custom_delim.ejs');
    try {
      fs.writeFileSync(tplPath, 'Hello [%= name %]!', 'utf8');
      const res = runCli(['-p', '[', '-c', ']', tplPath, 'name=CustomDelim']);
      assert.strictEqual(res.status, 0);
      assert.strictEqual(clean(res.stdout), 'Hello CustomDelim!');
    } finally {
      try { fs.unlinkSync(tplPath); } catch {}
    }
  });

  test('cli supports locals-name with -l flag', function () {
    const tplPath = path.resolve('test/fixtures/locals_name.ejs');
    try {
      fs.writeFileSync(tplPath, 'Val: <%= myData.score %>', 'utf8');
      const res = runCli(['-l', 'myData', '-i', '%7B%22score%22%3A99%7D', tplPath]);
      assert.strictEqual(res.status, 0);
      assert.strictEqual(clean(res.stdout), 'Val: 99');
    } finally {
      try { fs.unlinkSync(tplPath); } catch {}
    }
  });

  test('cli supports strict flag and no-with flag', function () {
    const tplPath = path.resolve('test/fixtures/strict_nowith.ejs');
    try {
      fs.writeFileSync(tplPath, 'Score: <%= locals.score %>', 'utf8');
      const res = runCli(['-s', '-n', tplPath, 'score=100']);
      assert.strictEqual(res.status, 0);
      assert.strictEqual(clean(res.stdout), 'Score: 100');
    } finally {
      try { fs.unlinkSync(tplPath); } catch {}
    }
  });

  test('cli renders multiple key-value parameters', function () {
    const tplPath = path.resolve('test/fixtures/multi_args.ejs');
    try {
      fs.writeFileSync(tplPath, '<%= first %> <%= last %>', 'utf8');
      const res = runCli([tplPath, 'first=Ada', 'last=Lovelace']);
      assert.strictEqual(res.status, 0);
      assert.strictEqual(clean(res.stdout), 'Ada Lovelace');
    } finally {
      try { fs.unlinkSync(tplPath); } catch {}
    }
  });

  test('cli exits with error when template file is missing', function () {
    const res = runCli([]);
    assert.notStrictEqual(res.status, 0);
  });

  test('cli exits with error when input file does not exist', function () {
    const res = runCli(['non_existent_file_xyz.ejs']);
    assert.notStrictEqual(res.status, 0);
  });
});
