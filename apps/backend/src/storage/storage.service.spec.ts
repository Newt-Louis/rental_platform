import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StorageService } from './storage.service';

describe('StorageService path isolation', () => {
  let root: string;
  let service: StorageService;
  const originalUploadDir = process.env.UPLOAD_DIR;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'leasing-storage-'));
    process.env.UPLOAD_DIR = root;
    service = new StorageService();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    process.env.UPLOAD_DIR = originalUploadDir;
  });

  it('reads files within the configured upload directory', async () => {
    const target = path.join(root, 'safe.txt');
    fs.writeFileSync(target, 'safe');

    const stream = service.getFileStream('safe.txt');

    expect(stream).not.toBeNull();
    const content = await new Promise<string>((resolve, reject) => {
      let value = '';
      stream?.setEncoding('utf8');
      stream?.on('data', (chunk) => { value += chunk; });
      stream?.on('end', () => resolve(value));
      stream?.on('error', reject);
    });
    expect(content).toBe('safe');
  });

  it('rejects traversal when reading files', () => {
    expect(service.getFileStream('../outside.txt')).toBeNull();
    expect(service.getFileStream(path.resolve(root, '..', 'outside.txt'))).toBeNull();
  });

  it('rejects traversal when deleting files', async () => {
    const outside = path.resolve(root, '..', `outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, 'must survive');

    await expect(service.deleteFile(outside)).resolves.toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
    fs.unlinkSync(outside);
  });
});
