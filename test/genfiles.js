import fs from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const gzip = promisify(zlib.gzip);
const brotliCompress = promisify(zlib.brotliCompress);

// Generates more complex JavaScript content
function generateComplexContent(sizeInBytes) {
    let content = '';
    const block = `function testFunc() {
        console.log("Hello, world " + index + "!");
        if (index % 2 === 0) {
            console.log("Even index", index);
        } else {
            console.log("Odd index", index);
        }
        for (let j = 0; j < 10; j++) {
            console.log(j);
        }
    }\n`;

    // Calculate how many times to repeat the block to get close to the desired size
    let repeats = Math.floor(sizeInBytes / block.length);
    for (let i = 0; i < repeats; i++) {
        content += block.replace(/index/g, i.toString());
    }

    // Adjust to get exactly the desired size by adding or trimming characters
    content = content.slice(0, sizeInBytes);
    return content;
}

async function generateTestFiles() {
    const testDir = './test/testEnv';
    const filePath = `${testDir}/index.js`;
    const gzipPath = `${testDir}/index.js.gz`;
    const brotliPath = `${testDir}/index.js.br`;

    // Ensure the directory exists
    fs.mkdirSync(testDir, { recursive: true });

    // Generate a file exactly 100 KB in size
    const sizeInBytes = 102400; // 100 KB
    const content = generateComplexContent(sizeInBytes);

    await writeFile(filePath, content);

    // Compress using gzip
    const gzipContent = await gzip(content);
    await writeFile(gzipPath, gzipContent);

    // Compress using brotli
    const brotliContent = await brotliCompress(content);
    await writeFile(brotliPath, brotliContent);
}

generateTestFiles();
