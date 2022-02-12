import * as path from 'path';
import * as fs from 'fs-extra';
import { shell } from '../src/api/shell';
import { Package } from './_package';

test('validate', () => {

  const pkg = Package.create({ name: 'consumer', licenses: ['Apache-2.0'], circular: true });
  const dep1 = pkg.addDependency({ name: 'dep1', licenses: ['INVALID'] });
  const dep2 = pkg.addDependency({ name: 'dep2', licenses: ['Apache-2.0', 'MIT'] });

  pkg.write();
  pkg.install();

  try {
    const command = [
      whereami(),
      '--copyright', 'copyright',
      '--entrypoint', pkg.entrypoint,
      '--resource', 'missing:bin/missing',
      '--license', 'Apache-2.0',
      'validate',
    ].join(' ');
    shell(command, { cwd: pkg.dir, quiet: true });
  } catch (e: any) {
    const violations = new Set(e.stderr.toString().trim().split('\n').filter((l: string) => l.startsWith('-')));
    const expected = new Set([
      `- invalid-license: Dependency ${dep1.name}@${dep1.version} has an invalid license: UNKNOWN`,
      `- multiple-license: Dependency ${dep2.name}@${dep2.version} has multiple licenses: Apache-2.0,MIT`,
      '- outdated-notice: NOTICE is outdated (fixable)',
      '- missing-resource: Unable to find resource (missing) relative to the package directory',
      '- circular-import: lib/bar.js -> lib/foo.js',
    ]);
    expect(violations).toEqual(expected);
  }

});

test('fix', () => {

  const pkg = Package.create({ name: 'consumer', licenses: ['Apache-2.0'] });
  pkg.addDependency({ name: 'dep1', licenses: ['MIT'] });
  pkg.addDependency({ name: 'dep2', licenses: ['Apache-2.0'] });

  pkg.write();
  pkg.install();

  const run = (sub: string) => {
    const command = [
      whereami(),
      '--copyright', 'copyright',
      '--entrypoint', pkg.entrypoint,
      '--license', 'Apache-2.0',
      '--license', 'MIT',
      sub,
    ].join(' ');
    shell(command, { cwd: pkg.dir, quiet: true });
  };

  try {
    run('pack');
    throw new Error('Expected packing to fail before fixing');
  } catch (e) {
    // this should fix the fact we don't generate
    // the project with the correct notice
    run('fix');
  }

  run('pack');
  const tarball = path.join(pkg.dir, `${pkg.name}-${pkg.version}.tgz`);
  expect(fs.existsSync(tarball)).toBeTruthy();

});

test('pack', () => {

  const pkg = Package.create({ name: 'consumer', licenses: ['Apache-2.0'] });
  const dep1 = pkg.addDependency({ name: 'dep1', licenses: ['MIT'] });
  const dep2 = pkg.addDependency({ name: 'dep2', licenses: ['Apache-2.0'] });

  const notice = [
    'copyright',
    '',
    '----------------------------------------',
    '',
    'This package includes the following third-party software:',
    '',
    `** ${dep1.name}@${dep1.version} - https://www.npmjs.com/package/${dep1.name}/v/${dep1.version} | MIT`,
    '',
    '',
    '---------------',
    '',
    `** ${dep2.name}@${dep2.version} - https://www.npmjs.com/package/${dep2.name}/v/${dep2.version} | Apache-2.0`,
    '',
    '',
    '---------------',
    '',
  ];

  pkg.notice = notice.join('\n');

  pkg.write();
  pkg.install();

  const command = [
    whereami(),
    '--copyright', 'copyright',
    '--entrypoint', pkg.entrypoint,
    '--license', 'Apache-2.0',
    '--license', 'MIT',
    'pack',
  ].join(' ');
  shell(command, { cwd: pkg.dir, quiet: true });

  const tarball = path.join(pkg.dir, `${pkg.name}-${pkg.version}.tgz`);
  expect(fs.existsSync(tarball)).toBeTruthy();

});

function whereami() {
  return path.join(path.join(__dirname, '..', 'bin', 'node-bundle'));
}