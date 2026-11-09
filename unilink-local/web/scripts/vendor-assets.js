const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'vendor');
const licenses = path.join(vendor, 'licenses');
const records = [];

fs.mkdirSync(licenses, { recursive: true });

function packageVersion(name) {
    return require(path.join(root, 'node_modules', name, 'package.json')).version;
}

function copyAsset(source, destination, name, version = packageVersion(name)) {
    const sourcePath = path.join(root, 'node_modules', source);
    const destinationPath = path.join(vendor, destination);
    fs.copyFileSync(sourcePath, destinationPath);
    records.push({ file: destination, package: name, version });
}

const assets = [
    ['react/umd/react.production.min.js', 'react.production.min.js', 'react'],
    ['react-dom/umd/react-dom.production.min.js', 'react-dom.production.min.js', 'react-dom'],
    ['@babel/standalone/babel.min.js', 'babel.min.js', '@babel/standalone'],
    ['xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js', 'xlsx'],
    ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-latin-variable.woff2', '@fontsource-variable/inter'],
    ['@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', 'jetbrains-mono-latin-variable.woff2', '@fontsource-variable/jetbrains-mono']
];

for (const [source, destination, name] of assets) {
    copyAsset(source, destination, name);
}

for (const name of [
    'react',
    'react-dom',
    '@babel/standalone',
    '@fontsource-variable/inter',
    '@fontsource-variable/jetbrains-mono',
    'tailwindcss',
    'xlsx'
]) {
    const packageDir = path.join(root, 'node_modules', name);
    const licenseName = ['LICENSE', 'LICENSE.txt', 'license', 'license.txt']
        .find(candidate => fs.existsSync(path.join(packageDir, candidate)));
    if (!licenseName) {
        throw new Error(`License file not found for ${name}`);
    }

    const version = packageVersion(name);
    const file = `${name.replace(/^@/, '').replace(/[^a-z0-9.-]+/gi, '-')}-LICENSE.txt`;
    fs.copyFileSync(path.join(packageDir, licenseName), path.join(licenses, file));
    records.push({ file: `licenses/${file}`, package: name, version });
}

const cssPath = path.join(root, 'css', 'tailwind.css');
if (fs.existsSync(cssPath)) {
    records.push({ file: '../css/tailwind.css', package: 'tailwindcss', version: packageVersion('tailwindcss') });
}

const rows = records.map(({ file, package: name, version }) => {
    const bytes = fs.readFileSync(path.resolve(vendor, file));
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    return { file, name, version, sha256 };
});

fs.writeFileSync(path.join(vendor, 'SHA256SUMS'), rows.map(row => `${row.sha256}  ${row.file}`).join('\n') + '\n');
const table = rows.map(row => `| \`${row.file}\` | ${row.name} ${row.version} | \`${row.sha256}\` |`).join('\n');
fs.writeFileSync(path.join(vendor, 'README.md'), [
    '# Frontend vendor assets',
    '',
    'These pinned assets are served locally so the application continues to work without internet access. Regenerate them from `web/` with `npm ci && npm run build`; review and commit the generated files together.',
    '',
    'The license files for each package are in `licenses/`.',
    '',
    '| File | Source/version | SHA-256 |',
    '|---|---|---|',
    table,
    ''
].join('\n'));
