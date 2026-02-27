import { registerAs } from '@nestjs/config';

export default registerAs('ses', () => ({
  // Reuses the same AWS credentials as S3
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  // SES may need a different region (e.g. us-east-1 is most supported)
  region: process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  fromEmail: process.env.SES_FROM_EMAIL ?? 'noreply@example.com',
  fromName: process.env.SES_FROM_NAME ?? 'My SaaS',
}));
