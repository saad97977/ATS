# CRUD Factory Pattern - Quick Reference

## 🎯 What You Got

A **minimal CRUD factory** that generates full CRUD functionality with just a few lines of code.

**Total Code**: 3 files, ~70 lines (vs 500+ lines without factory)

---

## 📁 Files Created

### 1. **crudFactory.ts** (70 lines)
Factory function that generates CRUD methods for any model:
```typescript
function createCrudController(config) {
  return {
    getAll,    // GET / with pagination
    getById,   // GET /:id
    create,    // POST /
    update,    // PATCH /:id
    delete,    // DELETE /:id
  };
}
```

### 2. **jobDetailController.ts** (12 lines)
Controller using the factory:
```typescript
export const jobDetailController = createCrudController({
  model: prisma.jobDetail,
  modelName: 'JobDetail',
  defaultLimit: 10,
  maxLimit: 100,
});
```

### 3. **jobDetailRoutes.ts** (25 lines)
Routes using the controller:
```typescript
router.get('/', jobDetailController.getAll);
router.post('/', jobDetailController.create);
router.get('/:id', jobDetailController.getById);
router.patch('/:id', jobDetailController.update);
router.delete('/:id', jobDetailController.delete);
```

---

## 🚀 Integration (2 steps)

### Step 1: Add import in server.ts
```typescript
import jobDetailRoutes from './routes/jobDetailRoutes';
```

### Step 2: Register route
```typescript
app.use('/api/job-details', jobDetailRoutes);
```

---

## 📊 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/job-details?page=1&limit=10` | Get all with pagination |
| GET | `/api/job-details/:id` | Get by ID |
| POST | `/api/job-details` | Create |
| PATCH | `/api/job-details/:id` | Update |
| DELETE | `/api/job-details/:id` | Delete |

---

## 📝 Response Format

### Success
```json
{
  "success": true,
  "data": { /* data */ },
  "statusCode": 200
}
```

### GET all response
```json
{
  "success": true,
  "data": {
    "data": [...],
    "paging": {
      "total": 50,
      "page": 1,
      "limit": 10,
      "totalPages": 5
    }
  },
  "statusCode": 200
}
```

### Error
```json
{
  "success": false,
  "error": "Error message",
  "statusCode": 400
}
```

---

## 🎯 How to Use for Other Models

Once you like this pattern, apply it to other models:

### For User model:
```typescript
export const userController = createCrudController({
  model: prisma.user,
  modelName: 'User',
  defaultLimit: 20,
  maxLimit: 100,
});
```

### For Organization model:
```typescript
export const organizationController = createCrudController({
  model: prisma.organization,
  modelName: 'Organization',
  defaultLimit: 15,
  maxLimit: 100,
});
```

**That's it!** Just change the model and name.

---

## ⚙️ Configuration Options

```typescript
{
  model: prisma.model,           // Required: Prisma model
  modelName: 'ModelName',         // Required: Name for error messages
  defaultLimit: 10,              // Optional: Default page size
  maxLimit: 100,                 // Optional: Max page size
}
```

---

## ✨ Features

✅ **Pagination** - Built-in with page/limit
✅ **Error Handling** - Prisma error mapping
✅ **Status Codes** - Proper HTTP codes (201, 400, 404, 409, 500)
✅ **Consistent Responses** - All responses use same format
✅ **Minimal Code** - ~12 lines per model controller
✅ **Reusable** - One factory for all models
✅ **Type Safe** - Works with Prisma types

---

## 🧪 Test Examples

### Get All
```bash
curl "http://localhost:3000/api/job-details?page=1&limit=10"
```

### Get One
```bash
curl "http://localhost:3000/api/job-details/YOUR_ID"
```

### Create
```bash
curl -X POST http://localhost:3000/api/job-details \
  -H "Content-Type: application/json" \
  -d '{"job_id":"uuid","description":"test"}'
```

### Update
```bash
curl -X PATCH http://localhost:3000/api/job-details/YOUR_ID \
  -H "Content-Type: application/json" \
  -d '{"description":"updated"}'
```

### Delete
```bash
curl -X DELETE http://localhost:3000/api/job-details/YOUR_ID
```

---

## 📦 Code Summary

| File | Lines | Purpose |
|------|-------|---------|
| crudFactory.ts | 70 | Factory function |
| jobDetailController.ts | 12 | Controller (minimal) |
| jobDetailRoutes.ts | 25 | Routes (minimal) |
| **Total** | **107** | **Full CRUD with factory** |

**Compare to previous**: 500+ lines → 107 lines (78% reduction!)

---

## 🔄 Apply to All Models

For each model in your schema:

1. Copy factory (one-time)
2. Create controller (12 lines)
3. Create routes (25 lines)
4. Add import to server.ts
5. Done!

---

## 💡 What's Different

**Before (No Factory)**:
- Service layer: 200+ lines
- Controller: 150+ lines
- Validator: 50+ lines
- Routes: 30+ lines
- **Total: 430+ lines per model**

**After (With Factory)**:
- Factory: 70 lines (one-time)
- Controller: 12 lines (per model)
- Routes: 25 lines (per model)
- **Total: 70 + (12 + 25 × number of models)**

**For 10 models**:
- Before: 4,300+ lines
- After: 70 + 370 = **440 lines** (90% reduction!)

---

## ✅ Checklist

- [ ] Review crudFactory.ts
- [ ] Check jobDetailController.ts (minimal!)
- [ ] Review jobDetailRoutes.ts
- [ ] Add import to server.ts
- [ ] Test endpoints
- [ ] Ready for other models?

---

**Status**: ✅ Ready to use

**Next**: Test it, then tell me if you want to apply it to other models!
