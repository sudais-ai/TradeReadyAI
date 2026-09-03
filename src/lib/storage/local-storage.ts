import fs from "fs/promises";
import path from "path";
import { StorageProvider } from "./types";

const STORAGE_DIR = path.join(process.cwd(), "storage", "uploads");

export class LocalStorageProvider implements StorageProvider {
  constructor() {
    this.ensureDirectory();
  }

  private async ensureDirectory() {
    try {
      await fs.access(STORAGE_DIR);
    } catch {
      await fs.mkdir(STORAGE_DIR, { recursive: true });
    }
  }

  async upload(file: File, key: string): Promise<string> {
    await this.ensureDirectory();
    
    const filePath = path.join(STORAGE_DIR, key);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await fs.writeFile(filePath, buffer);
    return key;
  }

  async get(fileRef: string): Promise<Buffer | null> {
    const filePath = path.join(STORAGE_DIR, fileRef);
    try {
      const buffer = await fs.readFile(filePath);
      return buffer;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw e;
    }
  }

  async delete(fileRef: string): Promise<void> {
    const filePath = path.join(STORAGE_DIR, fileRef);
    try {
      await fs.unlink(filePath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        // File already missing, fail gracefully
        return;
      }
      throw e;
    }
  }
}
