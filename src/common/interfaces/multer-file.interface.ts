export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  /** Set by multer memoryStorage — contains the file bytes. */
  buffer: Buffer;
  /** Set by multer diskStorage — the generated filename on disk. */
  filename?: string;
}
