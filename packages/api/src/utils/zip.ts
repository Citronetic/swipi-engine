/**
 * Build a zip archive of a workspace directory.
 * Skips node_modules and dist to keep download sizes reasonable.
 */

import archiver from 'archiver';
import { createWriteStream } from 'node:fs';

export async function zipDirectory(
  sourceDir: string,
  outputPath: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve(archive.pointer()));
    archive.on('error', reject);

    archive.pipe(output);
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: ['node_modules/**', 'dist/**', '.git/**', '**/.DS_Store'],
      dot: false,
    });
    archive.finalize();
  });
}
