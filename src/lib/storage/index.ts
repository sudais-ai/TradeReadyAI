import { LocalStorageProvider } from "./local-storage";
import { S3StorageProvider } from "./s3-storage";
import { StorageProvider } from "./types";

export const storage: StorageProvider = process.env.AWS_BUCKET_NAME 
  ? new S3StorageProvider() 
  : new LocalStorageProvider();
