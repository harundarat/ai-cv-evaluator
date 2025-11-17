# Upload Module

This module handles file upload functionality for the AI Recruiter Assistant, specifically for uploading candidate CVs and Project Reports.

## Features

- **Direct S3 Upload**: Files are uploaded directly to AWS S3 using multer-s3
- **PDF-Only Validation**: Only accepts PDF files as per case study requirements
- **File Size Limit**: Maximum 10MB per file
- **Dual-Layer Validation**: Both Multer-level and Pipe-level validation
- **Type Safety**: Full TypeScript type safety for uploaded files

## Structure

```
upload/
├── constants/
│   └── file-validation.constants.ts    # Validation constants and error messages
├── validators/
│   └── file-validation.pipe.ts         # Custom validation pipes
├── upload.controller.ts                # Upload endpoint controller
├── upload.service.ts                   # Upload business logic
├── upload.module.ts                    # Module configuration
└── README.md                           # This file
```

## API Endpoint

### POST /upload

Upload candidate CV and Project Report files.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Fields:
  - `cv` (required): Candidate's CV in PDF format
  - `project_report` (required): Candidate's project report in PDF format

**Validations:**
- Both files must be present
- Both files must be PDF format (checked by MIME type and extension)
- Maximum file size: 10MB per file
- Only 2 files allowed per request

**Success Response (200 OK):**
```json
{
  "cv_id": 1,
  "project_report_id": 1,
  "message": "Files uploaded successfully"
}
```

**Error Responses:**

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Missing files | No files uploaded or missing CV/Project Report |
| 400 | Invalid file type | File is not a PDF (checked by MIME type or extension) |
| 400 | File too large | File exceeds 10MB limit |
| 500 | Upload failed | S3 upload failure or database error |

**Example Error Messages:**

```json
// Missing files
{
  "statusCode": 400,
  "message": "No files uploaded. Please upload both CV and Project Report",
  "error": "Bad Request"
}

// Invalid file type
{
  "statusCode": 400,
  "message": "CV must be a PDF file. Got MIME type: image/jpeg",
  "error": "Bad Request"
}

// File too large
{
  "statusCode": 400,
  "message": "CV is too large. Maximum size is 10MB, got 15.2MB",
  "error": "Bad Request"
}
```

## Validation Strategy

### 1. Multer-Level Validation (First Layer)

Located in `upload.module.ts`, this validation happens during file upload:

```typescript
fileFilter: (req, file, cb) => {
  // Check MIME type
  const isMimeTypeValid = ['application/pdf'].includes(file.mimetype);

  // Check file extension
  const isExtensionValid = filename.endsWith('.pdf');

  if (!isMimeTypeValid || !isExtensionValid) {
    return cb(new BadRequestException('Only PDF files are allowed'), false);
  }

  cb(null, true);
}
```

**Validation includes:**
- MIME type check: Must be `application/pdf`
- File extension check: Must end with `.pdf`
- File size limit: Maximum 10MB (enforced by Multer limits)

### 2. Pipe-Level Validation (Second Layer)

Located in `validators/file-validation.pipe.ts`, this validation happens after upload:

```typescript
@UsePipes(FilesValidationPipe)
async uploadFile(@UploadedFiles() files) { ... }
```

**FilesValidationPipe validates:**
1. Files object exists and is not null
2. CV file is present (files.cv is not empty)
3. Project Report file is present (files.project_report is not empty)
4. Each file passes FileValidationPipe checks:
   - File size ≤ 10MB
   - MIME type is `application/pdf`
   - File extension is `.pdf`

## Configuration Constants

All validation rules are centralized in `constants/file-validation.constants.ts`:

```typescript
export const FILE_VALIDATION_CONSTANTS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,  // 10MB
  MAX_FILE_SIZE_MB: 10,
  ALLOWED_MIME_TYPES: ['application/pdf'],
  ALLOWED_EXTENSIONS: ['.pdf'],
  MAX_FILES_COUNT: 2,  // CV + Project Report

  FIELD_NAMES: {
    CV: 'cv',
    PROJECT_REPORT: 'project_report',
  },

  DISPLAY_NAMES: {
    CV: 'CV',
    PROJECT_REPORT: 'Project Report',
  },
};
```

**Benefits:**
- Single source of truth for all validation rules
- Easy to update limits (e.g., increase max file size)
- Consistent error messages across the application
- Type-safe constants with TypeScript

## File Storage

Files are stored in AWS S3 with the following naming convention:

```
{field_name}/{timestamp}-{sanitized_filename}

Examples:
cv/1699999999999-john-doe-resume.pdf
project_report/1699999999999-case-study-implementation.pdf
```

**Key features:**
- Timestamp prefix prevents filename collisions
- Spaces are replaced with hyphens for safe URLs
- Original filename is preserved (sanitized)
- Files are organized by field name (cv vs project_report)

## Database Storage

File metadata is stored in PostgreSQL:

**CV Table:**
```typescript
model CV {
  id            Int    @id @default(autoincrement())
  original_name String  // Original filename from upload
  hosted_name   String  // S3 key (path in bucket)
  url           String  // Full S3 URL for direct access
}
```

**ProjectReport Table:**
```typescript
model ProjectReport {
  id            Int    @id @default(autoincrement())
  cv_id         Int    // Foreign key to CV
  original_name String
  hosted_name   String
  url           String
}
```

## Usage Example

### Using cURL

```bash
curl -X POST http://localhost:3000/upload \
  -F "cv=@/path/to/candidate_cv.pdf" \
  -F "project_report=@/path/to/project_report.pdf"
```

### Using JavaScript/TypeScript

```typescript
const formData = new FormData();
formData.append('cv', cvFile);
formData.append('project_report', projectReportFile);

const response = await fetch('http://localhost:3000/upload', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
console.log(result.cv_id, result.project_report_id);
```

## Error Handling

The module uses a layered error handling approach:

### 1. Multer Errors

Caught during upload process:
- File size exceeded
- Invalid file type
- Too many files

### 2. Validation Pipe Errors

Caught after upload:
- Missing files
- Invalid PDF format
- File validation failures

### 3. Service Errors

Caught during database operations:
- Database connection errors
- Constraint violations
- S3 storage errors

All errors are converted to appropriate HTTP status codes:
- `400 Bad Request` - Validation errors
- `500 Internal Server Error` - System errors

## Testing

### Test Valid Upload

```bash
# Should succeed
curl -X POST http://localhost:3000/upload \
  -F "cv=@test_cv.pdf" \
  -F "project_report=@test_report.pdf"
```

### Test Missing File

```bash
# Should fail with 400
curl -X POST http://localhost:3000/upload \
  -F "cv=@test_cv.pdf"
```

### Test Invalid File Type

```bash
# Should fail with 400
curl -X POST http://localhost:3000/upload \
  -F "cv=@test_cv.docx" \
  -F "project_report=@test_report.pdf"
```

### Test File Too Large

```bash
# Create a file larger than 10MB and try to upload
dd if=/dev/zero of=large_file.pdf bs=1M count=11

curl -X POST http://localhost:3000/upload \
  -F "cv=@large_file.pdf" \
  -F "project_report=@test_report.pdf"
# Should fail with 400
```

## Security Considerations

1. **File Type Validation**: Double-checked (MIME type + extension)
2. **File Size Limit**: Prevents DoS attacks via large files
3. **S3 Storage**: Files stored outside web root, not directly accessible
4. **No Code Execution**: PDFs are treated as data, not executable
5. **Input Sanitization**: Filenames are sanitized before storage

## Future Improvements

- [ ] Virus scanning integration (ClamAV)
- [ ] Image optimization for thumbnail generation
- [ ] Signed URLs for time-limited file access
- [ ] Support for multiple file formats (if requirements change)
- [ ] File compression before S3 upload
- [ ] Async upload with progress tracking
- [ ] Duplicate file detection (hash-based)

## Dependencies

- `@nestjs/platform-express` - File upload handling
- `multer` - Multipart form data parser
- `multer-s3` - Direct S3 upload stream
- `@aws-sdk/client-s3` - AWS S3 client
- `@prisma/client` - Database ORM

## Related Modules

- **Evaluate Module**: Uses uploaded files for AI evaluation
- **Shared Module**: Provides S3Service and PrismaService
- **S3 Service**: Low-level AWS S3 operations

## Troubleshooting

### Upload fails with "Request Entity Too Large"

**Cause**: File size exceeds limit

**Solution**: Ensure files are under 10MB or increase `MAX_FILE_SIZE_BYTES` in constants

### Upload succeeds but file not in S3

**Cause**: AWS credentials or bucket configuration issue

**Solution**: Check `.env` file for correct AWS credentials and bucket name

### Database foreign key error

**Cause**: CV record creation failed but ProjectReport still trying to link

**Solution**: Check database logs, ensure transaction is properly handled

### File type rejected despite being PDF

**Cause**: MIME type mismatch (some PDFs report different MIME types)

**Solution**: Update `ALLOWED_MIME_TYPES` to include additional PDF MIME types if needed
