import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

const BUCKET = process.env.S3_BUCKET_NAME || 'permasquare-storage';

// Simple S3 storage functions
export async function saveFile(key: string, content: string | Buffer, contentType = 'text/plain') {
    console.log(`💾 [S3 Storage] Saving file: ${key} (${contentType})`);
    
    try {
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: content,
            ContentType: contentType,
        }));
        
        console.log(`✅ [S3 Storage] Successfully saved: ${key}`);
        return key;
    } catch (error) {
        console.error(`❌ [S3 Storage] Failed to save: ${key}`, error);
        throw error;
    }
}

export async function getFile(key: string): Promise<Buffer> {
    console.log(`📥 [S3 Storage] Getting file: ${key}`);
    
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        }));

        if (!response.Body) {
            console.error(`❌ [S3 Storage] File not found: ${key}`);
            throw new Error(`File not found: ${key}`);
        }

        console.log(`📦 [S3 Storage] File found, converting to buffer: ${key}`);

        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as any) {
            chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);
        console.log(`✅ [S3 Storage] Successfully retrieved: ${key} (${buffer.length} bytes)`);
        return buffer;
        
    } catch (error) {
        console.error(`❌ [S3 Storage] Failed to get file: ${key}`, error);
        throw error;
    }
}

export async function listFiles(prefix: string): Promise<string[]> {
    console.log(`📂 [S3 Storage] Listing files with prefix: ${prefix}`);
    
    try {
        const response = await s3Client.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
        }));

        const files = response.Contents?.map(obj => obj.Key!).filter(Boolean) || [];
        console.log(`✅ [S3 Storage] Found ${files.length} files with prefix: ${prefix}`);
        
        return files;
    } catch (error) {
        console.error(`❌ [S3 Storage] Failed to list files with prefix: ${prefix}`, error);
        throw error;
    }
}

export async function getMultipleFiles(keys: string[]): Promise<Map<string, Buffer>> {
    console.log(`📦 [S3 Storage] Bulk retrieving ${keys.length} files`);
    
    const results = new Map<string, Buffer>();
    const promises = keys.map(async (key) => {
        try {
            const buffer = await getFile(key);
            results.set(key, buffer);
        } catch (error) {
            console.error(`❌ [S3 Storage] Failed to get file in bulk operation: ${key}`, error);
            // Don't add to results, but don't fail the entire operation
        }
    });

    await Promise.all(promises);
    
    console.log(`✅ [S3 Storage] Bulk retrieval complete: ${results.size}/${keys.length} files retrieved`);
    return results;
}
