# S3 Setup for Permasquare MVP

## Environment Variables

Add these to your `.env.local` file:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here  
AWS_REGION=us-east-1
S3_BUCKET_NAME=permasquare-storage
```

## AWS S3 Setup

1. **Create S3 Bucket:**
   - Go to AWS S3 Console
   - Create bucket named `permasquare-storage`
   - Set region to `us-east-1`
   - Leave other settings as default

2. **Create IAM User:**
   - Go to AWS IAM Console
   - Create user for programmatic access
   - Attach policy with S3 permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::permasquare-storage/*"
        }
    ]
}
```

3. **Get Credentials:**
   - Copy Access Key ID and Secret Access Key
   - Add to your `.env.local`

## How It Works

When you extract a site:
1. Pages saved as HTML files: `extractions/{siteId}/pages/{page.html}`
2. Assets downloaded and saved: `extractions/{siteId}/assets/{asset.css|js|png}`
3. Manifest saved as JSON: `extractions/{siteId}/manifest.json`

Simple and straightforward! 🚀 