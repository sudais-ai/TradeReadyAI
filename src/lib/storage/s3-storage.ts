import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { StorageProvider } from "./types";

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.AWS_BUCKET_NAME || "";
    this.client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }

  async upload(file: File, key: string): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    });

    await this.client.send(command);
    return key;
  }

  async get(fileRef: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileRef,
      });

      const response = await this.client.send(command);
      
      if (!response.Body) return null;
      
      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (e: any) {
      if (e.name === "NoSuchKey" || e.name === "NotFound") {
        return null;
      }
      throw e;
    }
  }

  async delete(fileRef: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileRef,
      });

      await this.client.send(command);
    } catch (e: any) {
      if (e.name === "NoSuchKey" || e.name === "NotFound") {
        return;
      }
      throw e;
    }
  }
}
