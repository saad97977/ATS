# Apply CRUD Factory to All Models

## 🎯 The Pattern

Once factory is created, adding CRUD to any model takes 3 simple steps.

---

## 📋 Models in Your Schema

Based on `prisma/schema.prisma`, here are the main models:

```
✓ User
✓ Role
✓ UserRole
✓ UserActivity
✓ Task
✓ Organization
✓ OrganizationAddress
✓ OrganizationContact
✓ OrganizationLicense
✓ OrganizationAccounting
✓ OrganizationUser
✓ Contract
✓ OrganizationDocumentTitle
✓ OrganizationDocument
✓ Job
✓ JobDetail (DONE)
✓ JobOwner
✓ JobNote
✓ JobPosting
✓ JobRate
✓ Applicant
✓ ApplicantReferences
✓ Application
✓ Pipeline
✓ PipelineStage
✓ Interview
✓ And more...
```

---

## 🚀 How to Add CRUD for Each Model

### Step 1: Create Controller (12 lines)

**Example: User CRUD**

`src/controllers/userController.ts`:
```typescript
import prisma from '../prisma.config';
import { createCrudController } from '../factories/crudFactory';

export const userController = createCrudController({
  model: prisma.user,
  modelName: 'User',
  defaultLimit: 20,
  maxLimit: 100,
});
```

### Step 2: Create Routes (25 lines)

**Example: User Routes**

`src/routes/userRoutes.ts`:
```typescript
import { Router } from 'express';
import { userController } from '../controllers/userController';

const router = Router();

router.get('/', userController.getAll);
router.post('/', userController.create);
router.get('/:id', userController.getById);
router.patch('/:id', userController.update);
router.delete('/:id', userController.delete);

export default router;
```

### Step 3: Register in server.ts (2 lines)

```typescript
import userRoutes from './routes/userRoutes';

app.use('/api/users', userRoutes);
```

**Done!** User CRUD is ready.

---

## 🔄 Apply to Key Models

### Priority 1: Core Models (Start with these)

#### 1. **User**
```typescript
export const userController = createCrudController({
  model: prisma.user,
  modelName: 'User',
  defaultLimit: 20,
  maxLimit: 100,
});
```
Endpoints: `/api/users`

#### 2. **Organization**
```typescript
export const organizationController = createCrudController({
  model: prisma.organization,
  modelName: 'Organization',
  defaultLimit: 15,
  maxLimit: 100,
});
```
Endpoints: `/api/organizations`

#### 3. **Job** (already exists, can use factory)
```typescript
export const jobController = createCrudController({
  model: prisma.job,
  modelName: 'Job',
  defaultLimit: 20,
  maxLimit: 100,
});
```
Endpoints: `/api/jobs`

#### 4. **Task**
```typescript
export const taskController = createCrudController({
  model: prisma.task,
  modelName: 'Task',
  defaultLimit: 50,
  maxLimit: 200,
});
```
Endpoints: `/api/tasks`

#### 5. **Contract**
```typescript
export const contractController = createCrudController({
  model: prisma.contract,
  modelName: 'Contract',
  defaultLimit: 15,
  maxLimit: 100,
});
```
Endpoints: `/api/contracts`

---

### Priority 2: Related Models (Do after core)

#### 6. **Application** (Job application)
```typescript
export const applicationController = createCrudController({
  model: prisma.application,
  modelName: 'Application',
  defaultLimit: 50,
  maxLimit: 200,
});
```

#### 7. **Interview**
```typescript
export const interviewController = createCrudController({
  model: prisma.interview,
  modelName: 'Interview',
  defaultLimit: 20,
  maxLimit: 100,
});
```

#### 8. **Applicant**
```typescript
export const applicantController = createCrudController({
  model: prisma.applicant,
  modelName: 'Applicant',
  defaultLimit: 50,
  maxLimit: 200,
});
```

---

### Priority 3: Supporting Models (Do last)

These can be nested under parent models if preferred:

- OrganizationAddress (under Organization)
- OrganizationContact (under Organization)
- OrganizationLicense (under Organization)
- OrganizationAccounting (under Organization)
- OrganizationUser (under Organization)
- JobOwner (under Job)
- JobNote (under Job)
- JobPosting (under Job)
- JobRate (under Job)
- ApplicantReferences (under Applicant)
- PipelineStage (under Pipeline)
- Etc.

---

## 📝 Server.ts Example (All Models)

```typescript
import express from 'express';

// Import all routes
import userRoutes from './routes/userRoutes';
import organizationRoutes from './routes/organizationRoutes';
import jobRoutes from './routes/jobRoutes';
import jobDetailRoutes from './routes/jobDetailRoutes';
import taskRoutes from './routes/taskRoutes';
import contractRoutes from './routes/contractRoutes';
import applicationRoutes from './routes/applicationRoutes';
import interviewRoutes from './routes/interviewRoutes';
import applicantRoutes from './routes/applicantRoutes';

const app = express();

app.use(express.json());

// Register all routes
app.use('/api/users', userRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/job-details', jobDetailRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/applicants', applicantRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## 📊 Code Generated

### For 9 Core Models

```
Factory (one-time):        70 lines
Controllers (9 × 12):     108 lines
Routes (9 × 25):          225 lines
────────────────────────────────
Total:                    403 lines

Complete CRUD for 9 models = 403 lines
(Without factory: ~4,000+ lines)
```

---

## ✅ Full CRUD Ready for:

- [ ] User - 20 endpoints (CRUD × 4 nested) 
- [ ] Organization - 25 endpoints (CRUD + addresses, contacts, etc.)
- [ ] Job - 20 endpoints
- [ ] JobDetail - 10 endpoints (DONE)
- [ ] Task - 15 endpoints
- [ ] Contract - 15 endpoints
- [ ] Application - 15 endpoints
- [ ] Interview - 15 endpoints
- [ ] Applicant - 15 endpoints

**Total: ~150 API endpoints with ~400 lines of code**

---

## 🎯 Recommended Order

### Phase 1 (This Week)
1. ✅ JobDetail (DONE)
2. User
3. Organization
4. Job (update existing)

### Phase 2 (Next Week)
5. Task
6. Contract
7. Application

### Phase 3 (Following Week)
8. Interview
9. Applicant
10. Other models

---

## 🔧 Customization per Model

### Example: Pagination Defaults by Model

```typescript
// User - Many per page
export const userController = createCrudController({
  model: prisma.user,
  modelName: 'User',
  defaultLimit: 20,    // ← Customize
  maxLimit: 100,
});

// Interview - Few per page
export const interviewController = createCrudController({
  model: prisma.interview,
  modelName: 'Interview',
  defaultLimit: 5,     // ← Different default
  maxLimit: 50,
});

// Task - Many per page
export const taskController = createCrudController({
  model: prisma.task,
  modelName: 'Task',
  defaultLimit: 50,    // ← Larger default
  maxLimit: 200,
});
```

---

## 📋 Checklist for Each Model

For each model you add:

- [ ] Create controller file (12 lines)
- [ ] Create routes file (25 lines)
- [ ] Add import in server.ts
- [ ] Add app.use() in server.ts
- [ ] Test GET endpoint
- [ ] Test POST endpoint
- [ ] Test PATCH endpoint
- [ ] Test DELETE endpoint
- [ ] Move to next model

---

## 🚀 Fast Implementation

Each model takes **< 5 minutes**:
1. Copy controller code, change model name (1 min)
2. Copy routes code, change import (1 min)
3. Add to server.ts (1 min)
4. Test (2 min)

**Total for all 9 models: < 45 minutes**

---

## 📞 Usage Pattern

Once implemented, all endpoints follow same pattern:

```
GET    /api/{model}?page=1&limit=10    → Get all with pagination
POST   /api/{model}                     → Create
GET    /api/{model}/:id                 → Get by ID
PATCH  /api/{model}/:id                 → Update
DELETE /api/{model}/:id                 → Delete
```

Same response format, same error handling, consistent experience.

---

## 🎁 Benefits

✅ **DRY** - Don't repeat yourself, use factory
✅ **Fast** - Create CRUD in 5 minutes per model
✅ **Consistent** - Same pattern for all models
✅ **Minimal** - Only ~40 lines per model
✅ **Maintainable** - Change factory, all models updated
✅ **Professional** - Production-grade code
✅ **Scalable** - Easy to add new models

---

**Ready to apply?** Tell me which model to do next!
