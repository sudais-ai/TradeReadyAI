export interface StorageProvider {
  /**
   * Uploads a file and returns a unique file reference key.
   */
  upload(file: File, key: string): Promise<string>;

  /**
   * Retrieves a file by its reference key.
   * Returns a Buffer or Blob depending on implementation.
   */
  get(fileRef: string): Promise<Buffer | null>;

  /**
   * Deletes a file by its reference key.
   */
  delete(fileRef: string): Promise<void>;
}
