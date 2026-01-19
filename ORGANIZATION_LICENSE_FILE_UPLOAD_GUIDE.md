# Organization License File Upload Guide

## Overview

The Organization License module now supports file uploads. You can upload license documents (PDF, images, Word documents, Excel files) and they will be automatically stored in your database with file path references.

## Features

✅ **File Upload Support** - Upload license documents with automatic file management
✅ **Multiple File Types** - Supports PDF, images, Word, Excel documents
✅ **File Size Limits** - 50MB maximum file size per upload
✅ **Download Support** - Download uploaded licenses
✅ **Automatic Organization** - Files organized by type in `/uploads/licenses/` directory
✅ **Database Integration** - File paths stored in database for easy tracking

## Setup

All dependencies are already installed:
- `multer` - File upload handling
- `@types/multer` - TypeScript type definitions

## API Endpoints

### 1. Create License with File Upload
**POST** `/organization-licenses/upload`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `organization_id` (string, required) - UUID of the organization
- `license_name` (string, required) - Name of the license
- `license_document` (file, required) - The license file
- `expiration_date` (string, optional) - ISO date string (e.g., "2025-12-31")

**Example using cURL:**
```bash
curl -X POST http://localhost:5000/organization-licenses/upload \
  -F "organization_id=550e8400-e29b-41d4-a716-446655440000" \
  -F "license_name=Business License 2025" \
  -F "license_document=@/path/to/license.pdf" \
  -F "expiration_date=2025-12-31"
```

**Example using JavaScript/Fetch:**
```javascript
const formData = new FormData();
formData.append('organization_id', '550e8400-e29b-41d4-a716-446655440000');
formData.append('license_name', 'Business License 2025');
formData.append('license_document', fileInput.files[0]); // File from input
formData.append('expiration_date', '2025-12-31');

const response = await fetch('http://localhost:5000/organization-licenses/upload', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
console.log(result);
```

**Success Response (201):**
```json
{
  "success": true,
  "statusCode": 201,
  "data": {
    "organization_license_id": "uuid-here",
    "organization_id": "550e8400-e29b-41d4-a716-446655440000",
    "license_name": "Business License 2025",
    "license_document": "uploads/licenses/1703432400000-abc123-license.pdf",
    "expiration_date": "2025-12-31T00:00:00.000Z"
  },
  "file": {
    "filename": "1703432400000-abc123-license.pdf",
    "originalName": "license.pdf",
    "size": 245678,
    "path": "uploads/licenses/1703432400000-abc123-license.pdf"
  }
}
```

---

### 2. Get All Licenses
**GET** `/organization-licenses`

**Query Parameters:**
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 10)

**Example:**
```bash
curl http://localhost:5000/organization-licenses?page=1&limit=10
```

---

### 3. Get License by ID
**GET** `/organization-licenses/:id`

**Example:**
```bash
curl http://localhost:5000/organization-licenses/550e8400-e29b-41d4-a716-446655440000
```

---

### 4. Update License with Optional File
**PATCH** `/organization-licenses/:id/upload`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `license_name` (string, optional) - New license name
- `license_document` (file, optional) - New license file
- `expiration_date` (string, optional) - New expiration date

**Example using cURL:**
```bash
curl -X PATCH http://localhost:5000/organization-licenses/550e8400-e29b-41d4-a716-446655440000/upload \
  -F "license_name=Updated Business License" \
  -F "license_document=@/path/to/new-license.pdf"
```

---

### 5. Download License Document
**GET** `/organization-licenses/:id/download`

**Example:**
```bash
curl http://localhost:5000/organization-licenses/550e8400-e29b-41d4-a716-446655440000/download \
  -o license.pdf
```

---

### 6. Update License Without File
**PATCH** `/organization-licenses/:id`

**Content-Type:** `application/json`

**Body:**
```json
{
  "license_name": "Updated Name",
  "expiration_date": "2025-12-31"
}
```

---

### 7. Delete License
**DELETE** `/organization-licenses/:id`

**Example:**
```bash
curl -X DELETE http://localhost:5000/organization-licenses/550e8400-e29b-41d4-a716-446655440000
```

---

## Supported File Types

### Allowed MIME Types:
- **Documents**: PDF, Microsoft Word (.doc, .docx), Microsoft Excel (.xls, .xlsx)
- **Images**: JPEG, PNG
- **Maximum Size**: 50 MB per file

### File Type Details:
| MIME Type | Extension | Description |
|-----------|-----------|-------------|
| `application/pdf` | .pdf | PDF Documents |
| `image/jpeg` | .jpg, .jpeg | JPEG Images |
| `image/png` | .png | PNG Images |
| `application/msword` | .doc | Word 97-2003 Document |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | .docx | Word 2007+ Document |
| `application/vnd.ms-excel` | .xls | Excel 97-2003 Spreadsheet |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | .xlsx | Excel 2007+ Spreadsheet |

---

## File Storage

### Directory Structure
```
project-root/
├── uploads/
│   └── licenses/
│       ├── 1703432400000-abc123-license.pdf
│       ├── 1703432401000-def456-license.docx
│       └── ...
├── src/
├── prisma/
└── ...
```

### Database Storage
The `license_document` field stores the relative file path:
```
uploads/licenses/1703432400000-abc123-license.pdf
```

The file can be accessed via:
- **Local Path**: `process.cwd() + '/' + license_document`
- **Download URL**: `GET /organization-licenses/:id/download`
- **Direct Access**: Use the file service utilities

---

## Using the File Upload Service

The `FileUploadService` provides utilities for handling files across your application:

```typescript
import {
  createUploadInstance,
  getRelativeFilePath,
  getAbsoluteFilePath,
  fileExists,
  deleteFile,
  getFileInfo,
  ALLOWED_MIME_TYPES
} from '../../services/fileUploadService';

// Create custom upload instance
const uploadDocuments = createUploadInstance(
  'documents',
  ALLOWED_MIME_TYPES.documents,
  100 * 1024 * 1024 // 100MB
);

// Check if file exists
if (fileExists('uploads/licenses/myfile.pdf')) {
  console.log('File exists');
}

// Get file info
const info = getFileInfo('uploads/licenses/myfile.pdf');
console.log(`File size: ${info.size} bytes`);

// Delete file
deleteFile('uploads/licenses/myfile.pdf');

// Get file paths
const relPath = getRelativeFilePath('licenses', 'myfile.pdf');
const absPath = getAbsoluteFilePath(relPath);
```

---

## Error Handling

### Common Errors

**400 - Organization ID is required**
```json
{
  "success": false,
  "error": "Organization ID is required",
  "statusCode": 400
}
```

**400 - License document file is required**
```json
{
  "success": false,
  "error": "License document file is required",
  "statusCode": 400
}
```

**400 - Invalid file type**
```json
{
  "success": false,
  "error": "Invalid file type: application/zip. Allowed types: PDF, images, Word, Excel documents",
  "statusCode": 400
}
```

**404 - Organization not found**
```json
{
  "success": false,
  "error": "Organization not found",
  "statusCode": 404
}
```

**413 - Payload too large**
```json
{
  "success": false,
  "error": "File too large. Maximum size: 50MB",
  "statusCode": 413
}
```

---

## Best Practices

1. **Always validate organization_id** before upload
2. **Use meaningful license names** for easy identification
3. **Set expiration dates** for license tracking
4. **Clean up old files** periodically
5. **Backup uploads directory** regularly
6. **Use download endpoint** instead of direct file access
7. **Log file operations** for audit trails

---

## Extending the Module

To add file uploads to other models, follow this pattern:

```typescript
// 1. Create upload middleware in fileUploadMiddleware.ts
export const uploadDocuments = multer({...});

// 2. Add file upload functions to controller
export const createWithFile = async (req, res) => {...};

// 3. Update routes
router.post('/upload', uploadDocuments.single('document'), createWithFile);

// 4. Use file service utilities for file operations
```

---

## Database Schema

```prisma
model OrganizationLicense {
  organization_license_id String    @id @default(uuid())
  organization_id         String
  license_name            String
  license_document        String    // Stores file path
  expiration_date         DateTime?

  organization Organization @relation(fields: [organization_id], references: [organization_id], onDelete: Cascade)

  @@index([organization_id])
  @@map("organization_licenses")
}
```

---

## Troubleshooting

### Files not uploading?
- Check file size (max 50MB)
- Verify file type is in allowed list
- Ensure form data is properly formatted
- Check `/uploads/licenses/` directory exists

### Download not working?
- Verify `license_document` path is correct in database
- Ensure file exists in `/uploads/` directory
- Check file permissions

### Performance issues?
- Implement pagination for large file listings
- Archive old files to cloud storage
- Use CDN for file serving in production

---

## Security Considerations

✅ **File Validation**
- Validated MIME types prevent malicious uploads
- File size limits prevent abuse

⚠️ **Additional Recommendations**
- Implement rate limiting on upload endpoints
- Add virus scanning for production
- Use cloud storage (S3, Azure Blob) for scalability
- Encrypt sensitive documents
- Implement access control lists (ACL)
- Log all file operations

---
